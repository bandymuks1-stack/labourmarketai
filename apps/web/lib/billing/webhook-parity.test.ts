/**
 * PARITY PROOF for the canonical-apply refactor (#2122).
 *
 * ORACLE = the webhook route's ORIGINAL inline apply/ack logic, copied
 * verbatim from origin/main@0dd32d1eb (apps/web/app/api/billing/webhook/route.ts
 * lines 97-209) into `oracleHandle` below. AFTER = the real route (now calling
 * lib/billing/apply-subscription-snapshot.ts). Both run the same event fixtures
 * against the same mocked collaborators; every observable effect must be
 * identical: HTTP status + body, the exact arguments handed to the store, the
 * idempotency-record calls, and the checkout-operation bookkeeping.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/billing/provider", () => ({ getBillingProvider: vi.fn() }));
const cfg = vi.hoisted(() => ({ state: "stripe_test" as string, testMode: true }));
vi.mock("@/lib/billing/config", () => ({ getBillingConfig: () => cfg }));
vi.mock("@/lib/billing/subscription-store", () => ({
  recordWebhookEvent: vi.fn(),
  markWebhookProcessed: vi.fn(),
  markWebhookFailed: vi.fn(),
  upsertSubscription: vi.fn(),
  applyInvoicePayment: vi.fn(),
}));
vi.mock("@/lib/billing/checkout-operations-store", () => ({
  completeCheckoutOperationBySession: vi.fn(async () => "ok"),
  expireCheckoutOperationBySession: vi.fn(async () => "ok"),
}));

import { getBillingProvider } from "@/lib/billing/provider";
import {
  recordWebhookEvent,
  markWebhookProcessed,
  markWebhookFailed,
  upsertSubscription,
  applyInvoicePayment,
} from "@/lib/billing/subscription-store";
import {
  completeCheckoutOperationBySession,
  expireCheckoutOperationBySession,
} from "@/lib/billing/checkout-operations-store";
import {
  isHandledEventType,
  isRecordOnlyEventType,
  parseSubscriptionObject,
  parseCheckoutSessionObject,
  parseInvoiceObject,
  summarizeRecordedEvent,
} from "@/lib/billing/webhook-core";
import { POST } from "@/app/api/billing/webhook/route";

type Ev = {
  id: string;
  type: string;
  testMode: boolean;
  created?: number;
  object: Record<string, unknown>;
};
type Out = { status: number; body: unknown };

// ─── ORACLE: the pre-refactor route body (post-signature, post-mode-gate) ────
async function oracleHandle(event: Ev): Promise<Out> {
  const json = (body: unknown, status = 200): Out => ({ status, body });
  const summary = summarizeRecordedEvent(event.type, event.object);
  const created = typeof event.created === "number" ? event.created : null;
  const lean: Record<string, unknown> = { id: event.id, type: event.type };
  if (created !== null) lean.created = created;
  const recorded = await recordWebhookEvent({
    eventId: event.id,
    eventType: event.type,
    testMode: event.testMode,
    eventCreated: created,
    payload: summary ? { ...lean, summary } : lean,
  });
  if (recorded === "duplicate-processed") return json({ ok: true, received: true, duplicate: true });
  if (recorded === "needs-migration") return json({ ok: true, received: true, processed: false, reason: "needs-migration" });
  if (recorded === "error") return json({ ok: false, received: true, processed: false, reason: "record_failed" }, 500);
  if (!isHandledEventType(event.type)) {
    await markWebhookProcessed(event.id);
    return json({ ok: true, received: true, ignored: true });
  }
  if (isRecordOnlyEventType(event.type)) {
    await markWebhookProcessed(event.id);
    return json({ ok: true, received: true, processed: true, recordOnly: true });
  }
  let result: string = "ok";
  try {
    if (event.type === "checkout.session.completed") {
      const link = parseCheckoutSessionObject(event.object, event.testMode);
      if (link) {
        result = await upsertSubscription({
          providerSubscriptionId: link.providerSubscriptionId,
          providerCustomerId: link.providerCustomerId,
          ownerId: link.ownerId,
          planKey: link.planKey,
          organizationId: link.organizationId,
          status: "incomplete",
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          testMode: link.testMode,
          transitionKind: "link",
          eventId: event.id,
          eventCreated: created,
        });
        const sessionId = typeof event.object.id === "string" ? event.object.id : null;
        if (sessionId && (result === "ok" || result === "stale-event")) {
          await completeCheckoutOperationBySession({
            sessionId,
            providerSubscriptionId: link.providerSubscriptionId,
          });
        }
      }
    } else if (event.type === "checkout.session.expired") {
      const sessionId = typeof event.object.id === "string" ? event.object.id : null;
      if (sessionId) await expireCheckoutOperationBySession(sessionId);
    } else if (event.type.startsWith("customer.subscription.")) {
      const sub = parseSubscriptionObject(event.object, event.testMode, { id: event.id, created });
      if (sub) {
        if (event.type === "customer.subscription.deleted") {
          result = await upsertSubscription({ ...sub, status: "cancelled" });
        } else {
          result = await upsertSubscription(sub);
        }
      }
    } else if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_succeeded" ||
      event.type === "invoice.payment_failed"
    ) {
      const inv = parseInvoiceObject(event.object, event.type !== "invoice.payment_failed");
      result = await applyInvoicePayment(inv.providerSubscriptionId, inv.lastPaymentStatus, {
        id: event.id,
        created,
      });
    }
  } catch (e) {
    await markWebhookFailed(event.id, e instanceof Error ? e.message : "process_error");
    return json({ ok: false, received: true, processed: false, reason: "process_error" }, 500);
  }
  if (result === "ok" || result === "stale-event") {
    await markWebhookProcessed(event.id);
    return json({ ok: true, received: true, processed: true, result });
  }
  if (result === "needs-migration") {
    await markWebhookFailed(event.id, "needs-migration");
    return json({ ok: true, received: true, processed: false, reason: "needs-migration" });
  }
  await markWebhookFailed(event.id, result);
  return json({ ok: false, received: true, processed: false, reason: result }, 500);
}

// ─── harness ────────────────────────────────────────────────────────────────
const SUB = {
  id: "sub_1",
  customer: "cus_1",
  status: "active",
  cancel_at_period_end: false,
  metadata: { plan_key: "company_pilot", client_reference_id: "owner_1", organization_id: "org_1" },
  items: { data: [{ current_period_start: 100, current_period_end: 200, price: { id: "price_1", unit_amount: 9900, currency: "eur" } }] },
};
const sub = (type: string, id = "evt_1", created = 1700000000, obj: Record<string, unknown> = SUB): Ev => ({ id, type, testMode: true, created, object: obj });
const LINK: Ev = {
  id: "evt_link",
  type: "checkout.session.completed",
  testMode: true,
  created: 1700000000,
  object: { id: "cs_1", subscription: "sub_1", customer: "cus_1", client_reference_id: "owner_1", metadata: { plan_key: "company_pilot", organization_id: "org_1" } },
};

interface Case {
  name: string;
  event: Ev;
  record?: "ok" | "duplicate-processed" | "duplicate-unprocessed" | "needs-migration" | "error";
  upsert?: string | Error;
}

const CASES: Case[] = [
  { name: "normal subscription update", event: sub("customer.subscription.updated"), upsert: "ok" },
  { name: "subscription created", event: sub("customer.subscription.created"), upsert: "ok" },
  { name: "stale event (store skips)", event: sub("customer.subscription.updated", "evt_old", 1), upsert: "stale-event" },
  { name: "terminal row not revived (store skips)", event: sub("customer.subscription.updated"), upsert: "stale-event" },
  { name: "duplicate event, processed", event: sub("customer.subscription.updated"), record: "duplicate-processed" },
  { name: "duplicate event, unprocessed (Stripe retry) is reprocessed", event: sub("customer.subscription.updated"), record: "duplicate-unprocessed", upsert: "ok" },
  { name: "delete / cancel", event: sub("customer.subscription.deleted"), upsert: "ok" },
  { name: "checkout link event", event: LINK, upsert: "ok" },
  { name: "checkout link event, stale", event: LINK, upsert: "stale-event" },
  { name: "checkout link event, store error (no operation bookkeeping)", event: LINK, upsert: "error" },
  { name: "checkout session without subscription", event: { ...LINK, object: { id: "cs_2" } }, upsert: "ok" },
  { name: "conflict-live-subscription", event: sub("customer.subscription.updated"), upsert: "conflict-live-subscription" },
  { name: "store error", event: sub("customer.subscription.updated"), upsert: "error" },
  { name: "store needs-migration", event: sub("customer.subscription.updated"), upsert: "needs-migration" },
  { name: "apply throws (record stays open, 500)", event: sub("customer.subscription.updated"), upsert: new Error("boom") },
  { name: "record needs-migration", event: sub("customer.subscription.updated"), record: "needs-migration" },
  { name: "record error", event: sub("customer.subscription.updated"), record: "error" },
  { name: "non-subscription object on a subscription event", event: sub("customer.subscription.updated", "evt_x", 1, {}), upsert: "ok" },
  { name: "unhandled event type", event: sub("customer.created"), upsert: "ok" },
];

async function observe(run: () => Promise<Out>, c: Case) {
  vi.clearAllMocks();
  vi.mocked(recordWebhookEvent).mockResolvedValue(c.record ?? "ok");
  if (c.upsert instanceof Error) vi.mocked(upsertSubscription).mockRejectedValue(c.upsert);
  else vi.mocked(upsertSubscription).mockResolvedValue((c.upsert ?? "ok") as never);
  vi.mocked(applyInvoicePayment).mockResolvedValue("ok");
  const out = await run();
  return {
    out,
    upsert: vi.mocked(upsertSubscription).mock.calls,
    record: vi.mocked(recordWebhookEvent).mock.calls,
    processed: vi.mocked(markWebhookProcessed).mock.calls,
    failed: vi.mocked(markWebhookFailed).mock.calls,
    complete: vi.mocked(completeCheckoutOperationBySession).mock.calls,
    expire: vi.mocked(expireCheckoutOperationBySession).mock.calls,
  };
}

async function afterRoute(event: Ev): Promise<Out> {
  vi.mocked(getBillingProvider).mockResolvedValue({
    id: "stripe_test",
    active: true,
    constructWebhookEvent: vi.fn().mockResolvedValue(event),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const res = await POST(new Request("http://localhost/api/billing/webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "t=1,v1=x" } }));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  cfg.state = "stripe_test";
});

describe("webhook parity: original inline route (oracle) vs canonical primitive", () => {
  it.each(CASES.map((c) => [c.name, c] as const))("%s", async (_n, c) => {
    const before = await observe(() => oracleHandle(c.event), c);
    const after = await observe(() => afterRoute(c.event), c);
    expect(after.out).toEqual(before.out);
    expect(after.upsert).toEqual(before.upsert);
    expect(after.record).toEqual(before.record);
    expect(after.processed).toEqual(before.processed);
    expect(after.failed).toEqual(before.failed);
    expect(after.complete).toEqual(before.complete);
    expect(after.expire).toEqual(before.expire);
  });

  it("the table is not vacuous: oracle and route both really wrote through the store", async () => {
    const c = CASES[0];
    const before = await observe(() => oracleHandle(c.event), c);
    expect(before.upsert).toHaveLength(1);
    expect(before.upsert[0][0]).toMatchObject({ providerSubscriptionId: "sub_1", status: "active", eventCreated: 1700000000 });
    const del = CASES.find((x) => x.name === "delete / cancel")!;
    expect((await observe(() => afterRoute(del.event), del)).upsert[0][0].status).toBe("cancelled");
  });
});
