/**
 * Recovery adapter: Stripe retrieve -> shared parser -> the ONE apply primitive.
 * The store is mocked at the module boundary; the real parser + real apply
 * primitive run, so these tests prove convergence with the webhook path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cfg = vi.hoisted(() => ({ state: "stripe_live" as string }));
vi.mock("@/lib/billing/config", () => ({ getBillingConfig: () => cfg }));
vi.mock("@/lib/billing/provider", () => ({ getBillingProvider: vi.fn() }));
vi.mock("@/lib/billing/subscription-store", () => ({
  recordWebhookEvent: vi.fn(),
  markWebhookProcessed: vi.fn(),
  markWebhookFailed: vi.fn(),
  upsertSubscription: vi.fn(),
  readSubscriptionState: vi.fn(),
}));

import { getBillingProvider } from "@/lib/billing/provider";
import {
  markWebhookFailed,
  markWebhookProcessed,
  readSubscriptionState,
  recordWebhookEvent,
  upsertSubscription,
} from "@/lib/billing/subscription-store";
import { reconcileSubscription } from "@/lib/billing/reconcile-subscription";

const upsert = vi.mocked(upsertSubscription);
const record = vi.mocked(recordWebhookEvent);
const processed = vi.mocked(markWebhookProcessed);
const failed = vi.mocked(markWebhookFailed);
const readLocal = vi.mocked(readSubscriptionState);
const retrieveRaw = vi.fn();
const list = vi.fn();

const NOW_MS = 1_800_000_000_500;
const STAMP = 1_800_000_000;
const sleep = vi.fn(async () => {});

const OBJ = {
  id: "sub_1",
  customer: "cus_1",
  status: "active",
  livemode: true,
  cancel_at_period_end: false,
  metadata: { plan_key: "company_pro", client_reference_id: "owner_1", organization_id: "org_1" },
  items: { data: [{ current_period_start: 1, current_period_end: 2, price: { id: "price_1", unit_amount: 9900, currency: "eur" } }] },
};

function provider(active = true) {
  vi.mocked(getBillingProvider).mockResolvedValue({
    id: "stripe_live",
    active,
    retrieveSubscriptionRaw: retrieveRaw,
    listCustomerSubscriptions: list,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

const run = (extra: Record<string, unknown> = {}) =>
  reconcileSubscription({ stripeSubscriptionId: "sub_1", source: "cron", now: () => NOW_MS, sleep, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  cfg.state = "stripe_live";
  provider();
  retrieveRaw.mockResolvedValue({ ok: true, object: OBJ, livemode: true });
  record.mockResolvedValue("ok");
  upsert.mockResolvedValue("ok");
  processed.mockResolvedValue();
  failed.mockResolvedValue();
  readLocal.mockResolvedValue({ status: "found", row: { status: "incomplete", ownerId: "owner_1", planKey: "company_pro" } });
});

describe("happy path converges through the canonical primitive", () => {
  it("applied: stamps the snapshot with the time captured BEFORE the retrieve", async () => {
    let stampWhenRetrieved = -1;
    const clock = vi.fn().mockReturnValueOnce(NOW_MS).mockReturnValue(NOW_MS + 5_000);
    retrieveRaw.mockImplementation(async () => {
      stampWhenRetrieved = clock.mock.calls.length;
      return { ok: true, object: OBJ, livemode: true };
    });
    const r = await run({ now: clock });
    expect(r).toMatchObject({ outcome: "applied", changed: true, status: "active" });
    expect(stampWhenRetrieved).toBe(1); // clock read exactly once, before the provider call
    const u = upsert.mock.calls[0][0];
    expect(u).toMatchObject({
      providerSubscriptionId: "sub_1",
      ownerId: "owner_1",
      planKey: "company_pro",
      organizationId: "org_1",
      status: "active",
      testMode: false,
      eventId: "reconcile:cron",
      eventCreated: STAMP,
      providerPriceId: "price_1",
    });
    expect(u.transitionKind).toBeUndefined(); // a full snapshot, not a link
    expect(processed).toHaveBeenCalled();
  });

  it("audits through payment_webhook_events with a distinct reconcile:<source> marker", async () => {
    await run();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: `reconcile:cron:sub_1:${STAMP}`,
        eventType: "reconcile.subscription",
        testMode: false,
        eventCreated: STAMP,
        payload: expect.objectContaining({ source: "reconcile:cron", subscription_id: "sub_1" }),
      }),
    );
  });

  it("an unchanged status is applied with changed=false (already current)", async () => {
    readLocal.mockResolvedValue({ status: "found", row: { status: "active", ownerId: "owner_1", planKey: "company_pro" } });
    expect(await run()).toMatchObject({ outcome: "applied", changed: false });
  });

  it("repeat run is idempotent: same-second duplicate collapses to noop, no second write", async () => {
    await run();
    record.mockResolvedValue("duplicate-processed");
    expect(await run()).toMatchObject({ outcome: "noop", reason: "duplicate_run" });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("concurrent runs: both reach the same primitive; the unique audit key decides one writer", async () => {
    record.mockResolvedValueOnce("ok").mockResolvedValueOnce("duplicate-processed");
    const [a, b] = await Promise.all([run(), run()]);
    expect([a.outcome, b.outcome].sort()).toEqual(["applied", "noop"]);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("a duplicate-unprocessed audit row (earlier attempt died) is retried", async () => {
    record.mockResolvedValue("duplicate-unprocessed");
    expect((await run()).outcome).toBe("applied");
  });
});

describe("ordering: an older snapshot cannot overwrite a newer one", () => {
  it("store says stale-event -> outcome stale, audit closed, nothing else written", async () => {
    upsert.mockResolvedValue("stale-event");
    expect(await run()).toMatchObject({ outcome: "stale", changed: false });
    expect(processed).toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });

  it("the stamp is the PRE-retrieve instant: a webhook created before it is older, one created during the call is not", async () => {
    const { decideSubscriptionTransition } = await import("@/lib/billing/webhook-core");
    const row = { status: "active", lastEventCreatedAt: new Date(STAMP * 1000).toISOString() };
    // webhook event created 1 s BEFORE the recovery stamp, delivered later -> skipped
    expect(decideSubscriptionTransition(row, { kind: "subscription", status: "past_due", eventCreated: STAMP - 1 })).toMatchObject({ apply: false, reason: "stale_event" });
    // webhook event created during the call (same second as the stamp) -> still applies
    expect(decideSubscriptionTransition(row, { kind: "subscription", status: "past_due", eventCreated: STAMP })).toMatchObject({ apply: true });
    // an older recovery against a newer webhook-moved row is itself stale
    const newer = { status: "active", lastEventCreatedAt: new Date((STAMP + 60) * 1000).toISOString() };
    expect(decideSubscriptionTransition(newer, { kind: "subscription", status: "active", eventCreated: STAMP })).toMatchObject({ apply: false });
  });

  it("terminal rows are never revived (guard lives in the shared store; recovery just reports stale)", async () => {
    upsert.mockResolvedValue("stale-event");
    expect((await run()).outcome).toBe("stale");
  });
});

describe("safety", () => {
  it("noop provider / disabled billing -> inactive, provider never read", async () => {
    cfg.state = "disabled";
    expect(await run()).toMatchObject({ outcome: "inactive" });
    expect(retrieveRaw).not.toHaveBeenCalled();
    provider(false);
    cfg.state = "stripe_live";
    expect((await run()).outcome).toBe("inactive");
  });

  it("mode mismatch (TEST object under live adapter) -> conflict, no apply", async () => {
    retrieveRaw.mockResolvedValue({ ok: true, object: { ...OBJ, livemode: false }, livemode: false });
    expect(await run()).toMatchObject({ outcome: "conflict", reason: "mode_mismatch" });
    expect(upsert).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalled();
  });

  it("live object under the TEST adapter -> conflict too", async () => {
    cfg.state = "stripe_test";
    expect((await run()).reason).toBe("mode_mismatch");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("provider 429/5xx -> provider_error after bounded retries, NO writes (not even an audit row)", async () => {
    retrieveRaw.mockResolvedValue({ ok: false, reason: "rate", retryable: true });
    expect(await run()).toMatchObject({ outcome: "provider_error", reason: "provider_transient" });
    expect(retrieveRaw).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(record).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("a transient failure that recovers on retry applies", async () => {
    retrieveRaw
      .mockResolvedValueOnce({ ok: false, reason: "x", retryable: true })
      .mockResolvedValueOnce({ ok: true, object: OBJ, livemode: true });
    expect((await run()).outcome).toBe("applied");
  });

  it("a non-retryable provider failure is not retried", async () => {
    retrieveRaw.mockResolvedValue({ ok: false, reason: "auth", retryable: false });
    expect((await run()).outcome).toBe("provider_error");
    expect(retrieveRaw).toHaveBeenCalledTimes(1);
  });

  it("not found in Stripe -> not_found, audited, and we NEVER cancel locally", async () => {
    retrieveRaw.mockResolvedValue({ ok: true, object: null });
    expect((await run()).outcome).toBe("not_found");
    expect(upsert).not.toHaveBeenCalled();
    expect(processed).toHaveBeenCalled();
  });

  it("no local row and no signed owner/plan link -> noop, nothing created", async () => {
    readLocal.mockResolvedValue({ status: "none" });
    retrieveRaw.mockResolvedValue({ ok: true, object: { ...OBJ, metadata: {} }, livemode: true });
    expect(await run()).toMatchObject({ outcome: "noop", reason: "unlinked" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("store outcomes map 1:1: conflict-live-subscription, needs-migration, error", async () => {
    upsert.mockResolvedValueOnce("conflict-live-subscription");
    expect((await run()).outcome).toBe("conflict");
    upsert.mockResolvedValueOnce("needs-migration");
    expect((await run()).outcome).toBe("needs_migration");
    upsert.mockResolvedValueOnce("error");
    expect((await run()).outcome).toBe("store_error");
  });

  it("a throw inside apply is contained: store_error, audit left open, no rethrow", async () => {
    upsert.mockRejectedValue(new Error("boom"));
    const r = await run();
    expect(r.outcome).toBe("store_error");
    expect(failed).toHaveBeenCalled();
  });

  it("audit store failure -> store_error and the snapshot is NOT applied", async () => {
    record.mockResolvedValue("error");
    expect((await run()).outcome).toBe("store_error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects malformed ids and hostile source labels", async () => {
    expect((await run({ stripeSubscriptionId: "sub_1; drop" })).outcome).toBe("noop");
    await run({ source: "Bad Source!" });
    expect(record.mock.calls.at(-1)?.[0].eventId).toContain("reconcile:unknown:");
  });
});

describe("subject binding (used by user refresh)", () => {
  it("organization subject matches the signed metadata -> applied", async () => {
    expect((await run({ expectSubject: { type: "organization", id: "org_1" } })).outcome).toBe("applied");
  });
  it("another workspace's subscription -> conflict / subject_mismatch, nothing written", async () => {
    const r = await run({ expectSubject: { type: "organization", id: "org_OTHER" } });
    expect(r).toMatchObject({ outcome: "conflict", reason: "subject_mismatch" });
    expect(upsert).not.toHaveBeenCalled();
  });
  it("profile subject must be owner-bound AND org-free", async () => {
    expect((await run({ expectSubject: { type: "profile", id: "owner_1" } })).reason).toBe("subject_mismatch");
    retrieveRaw.mockResolvedValue({ ok: true, object: { ...OBJ, metadata: { plan_key: "p", client_reference_id: "owner_1" } }, livemode: true });
    expect((await run({ expectSubject: { type: "profile", id: "owner_1" } })).outcome).toBe("applied");
  });
});

describe("customer lookup", () => {
  it("fans out bounded and returns the most significant outcome", async () => {
    list.mockResolvedValue({ ok: true, subscriptions: Array.from({ length: 9 }, (_, i) => ({ id: `sub_${i}` })) });
    const r = await reconcileSubscription({ customerId: "cus_1", source: "cron", now: () => NOW_MS, sleep });
    expect(r.outcome).toBe("applied");
    expect(retrieveRaw).toHaveBeenCalledTimes(5);
  });
  it("with a subject binding, other workspaces' subscriptions are excluded (not_found, nothing written)", async () => {
    list.mockResolvedValue({ ok: true, subscriptions: [{ id: "sub_1" }, { id: "sub_2" }] });
    const r = await reconcileSubscription({ customerId: "cus_1", source: "user_refresh", expectSubject: { type: "organization", id: "org_OTHER" }, now: () => NOW_MS, sleep });
    expect(r.outcome).toBe("not_found");
    expect(upsert).not.toHaveBeenCalled();
  });
  it("no subscriptions -> not_found; list failure -> provider_error", async () => {
    list.mockResolvedValue({ ok: true, subscriptions: [] });
    expect((await reconcileSubscription({ customerId: "cus_1", source: "cron", sleep })).outcome).toBe("not_found");
    list.mockResolvedValue({ ok: false, reason: "x" });
    expect((await reconcileSubscription({ customerId: "cus_1", source: "cron", sleep })).outcome).toBe("provider_error");
  });
});
