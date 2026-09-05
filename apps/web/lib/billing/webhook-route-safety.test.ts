/**
 * Webhook route — billing safety v1 behaviours (store + operations mocked):
 *
 *   - Stripe's `created` is recorded with the idempotency record and carried
 *     into every subscription / invoice write (ordering evidence);
 *   - checkout.session.completed is applied as a LINK transition and books
 *     the server-side checkout operation complete;
 *   - a store "stale-event" (older/terminal) is acknowledged 200 + processed —
 *     a replay is not re-applied, Stripe does not retry;
 *   - checkout.session.expired closes the operation and touches no
 *     subscription state;
 *   - the live/test mode gate and record-first idempotency stay in front.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/billing/provider", () => ({ getBillingProvider: vi.fn() }));
const billingCfg = vi.hoisted(() => ({ state: "stripe_live" as string, testMode: false }));
vi.mock("@/lib/billing/config", () => ({ getBillingConfig: () => billingCfg }));
vi.mock("@/lib/billing/subscription-store", () => ({
  recordWebhookEvent: vi.fn(),
  markWebhookProcessed: vi.fn(),
  markWebhookFailed: vi.fn(),
  upsertSubscription: vi.fn(),
  applyInvoicePayment: vi.fn(),
}));
vi.mock("@/lib/billing/checkout-operations-store", () => ({
  completeCheckoutOperationBySession: vi.fn(),
  expireCheckoutOperationBySession: vi.fn(),
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
import { POST } from "@/app/api/billing/webhook/route";

const record = vi.mocked(recordWebhookEvent);
const processed = vi.mocked(markWebhookProcessed);
const failed = vi.mocked(markWebhookFailed);
const upsert = vi.mocked(upsertSubscription);
const invoicePay = vi.mocked(applyInvoicePayment);
const completeOp = vi.mocked(completeCheckoutOperationBySession);
const expireOp = vi.mocked(expireCheckoutOperationBySession);

const T0 = 1_757_000_000;

function withEvent(event: unknown): void {
  vi.mocked(getBillingProvider).mockResolvedValue({
    id: "stripe_live",
    active: true,
    constructWebhookEvent: vi.fn().mockResolvedValue(event),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function post(): Promise<Response> {
  return POST(new Request("http://localhost/api/billing/webhook", {
    method: "POST", body: "{}", headers: { "stripe-signature": "t=1,v1=deadbeef" },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  record.mockResolvedValue("ok");
  upsert.mockResolvedValue("ok");
  invoicePay.mockResolvedValue("ok");
  processed.mockResolvedValue();
  failed.mockResolvedValue();
  completeOp.mockResolvedValue("ok");
  expireOp.mockResolvedValue("ok");
});

describe("ordering evidence rides with every write", () => {
  it("record carries eventCreated + lean payload {id,type,created}", async () => {
    withEvent({ id: "evt_1", type: "customer.subscription.updated", testMode: false, created: T0, object: { id: "sub_1", status: "active", metadata: {} } });
    await post();
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ eventId: "evt_1", eventCreated: T0, payload: { id: "evt_1", type: "customer.subscription.updated", created: T0 } }));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ eventId: "evt_1", eventCreated: T0, status: "active" }));
  });

  it("invoice events pass the event id + created to applyInvoicePayment", async () => {
    withEvent({ id: "evt_inv", type: "invoice.payment_failed", testMode: false, created: T0, object: { id: "in_1", subscription: "sub_1" } });
    await post();
    expect(invoicePay).toHaveBeenCalledWith("sub_1", "failed", { id: "evt_inv", created: T0 });
  });
});

describe("checkout.session.completed — LINK transition + operation bookkeeping", () => {
  const SESSION = {
    id: "evt_cs", type: "checkout.session.completed", testMode: false, created: T0,
    object: { id: "cs_1", subscription: "sub_1", customer: "cus_1", client_reference_id: "owner-1", metadata: { canonical_plan_key: "company_pilot", organization_id: "org-1" } },
  };

  it("upserts as transitionKind 'link' (never regresses a real status) and completes the operation by session id", async () => {
    withEvent(SESSION);
    const res = await post();
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      providerSubscriptionId: "sub_1", organizationId: "org-1", planKey: "company_pilot",
      status: "incomplete", transitionKind: "link", eventId: "evt_cs", eventCreated: T0,
    }));
    expect(completeOp).toHaveBeenCalledWith({ sessionId: "cs_1", providerSubscriptionId: "sub_1" });
    expect(processed).toHaveBeenCalledWith("evt_cs");
  });

  it("a store failure leaves the operation untouched and keeps the record OPEN (retryable)", async () => {
    withEvent(SESSION);
    upsert.mockResolvedValue("error");
    const res = await post();
    expect(res.status).toBe(500);
    expect(completeOp).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledWith("evt_cs", "error");
  });
});

describe("stale-event — skipped on purpose, acknowledged, never retried", () => {
  it("upsert 'stale-event' → 200 processed, record CLOSED, no failure mark", async () => {
    withEvent({ id: "evt_old", type: "customer.subscription.updated", testMode: false, created: T0 - 100, object: { id: "sub_1", status: "incomplete", metadata: {} } });
    upsert.mockResolvedValue("stale-event");
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(true);
    expect(body.result).toBe("stale-event");
    expect(processed).toHaveBeenCalledWith("evt_old");
    expect(failed).not.toHaveBeenCalled();
  });

  it("invoice 'stale-event' is acknowledged the same way", async () => {
    withEvent({ id: "evt_i", type: "invoice.payment_failed", testMode: false, created: T0 - 100, object: { id: "in_1", subscription: "sub_1" } });
    invoicePay.mockResolvedValue("stale-event");
    const res = await post();
    expect(res.status).toBe(200);
    expect(processed).toHaveBeenCalledWith("evt_i");
  });
});

describe("checkout.session.expired — operation bookkeeping only", () => {
  it("closes the operation, writes NO subscription state, acknowledges processed", async () => {
    withEvent({ id: "evt_exp", type: "checkout.session.expired", testMode: false, created: T0, object: { id: "cs_9" } });
    const res = await post();
    expect(res.status).toBe(200);
    expect(expireOp).toHaveBeenCalledWith("cs_9");
    expect(upsert).not.toHaveBeenCalled();
    expect(invoicePay).not.toHaveBeenCalled();
    expect(processed).toHaveBeenCalledWith("evt_exp");
  });
});

describe("mode gate stays in front (live adapter)", () => {
  it("a TEST event under the live adapter is rejected before any record or write", async () => {
    withEvent({ id: "evt_t", type: "customer.subscription.updated", testMode: true, created: T0, object: { id: "sub_1", status: "active" } });
    const res = await post();
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("test_event_rejected");
    expect(record).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(completeOp).not.toHaveBeenCalled();
  });

  it("a duplicate-processed replay of checkout.session.completed does NOT re-run the link or the bookkeeping", async () => {
    withEvent({ id: "evt_cs", type: "checkout.session.completed", testMode: false, created: T0, object: { id: "cs_1", subscription: "sub_1" } });
    record.mockResolvedValue("duplicate-processed");
    const res = await post();
    expect((await res.json()).duplicate).toBe(true);
    expect(upsert).not.toHaveBeenCalled();
    expect(completeOp).not.toHaveBeenCalled();
  });
});
