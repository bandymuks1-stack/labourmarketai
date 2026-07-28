/**
 * COMMERCIAL CHAIN — end-to-end integration test (commercial readiness audit v1).
 *
 * Walks the whole paid path with the REAL store code against an in-memory
 * Postgres stand-in that enforces the same UNIQUE constraints as
 * `20260613200000_billing_test_mode_records.sql`:
 *
 *   new user → checkout link → subscription active → entitlement
 *   → failed payment → past_due → retry succeeds → active again
 *   → cancel → entitlement gone → re-subscribe → entitlement back
 *   → "log out / log in" (re-resolve from stored rows) → entitlement persists
 *
 * Every step below failed on `main` before this audit; each `it` names the
 * defect it pins. Stripe itself is never called — the payloads are the exact
 * shapes the pinned API version (2026-05-27.dahlia) sends.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── In-memory stand-in for the billing tables ────────────────────────────────

type Row = Record<string, unknown>;

const UNIQUE: Record<string, string[][]> = {
  billing_subscriptions: [
    ["provider", "provider_subscription_id"],
    ["owner_id", "plan_key", "provider"],
  ],
  billing_customers: [
    ["provider", "provider_customer_id"],
    ["owner_id", "provider"],
  ],
  payment_webhook_events: [["provider", "event_id"]],
};

const db: Record<string, Row[]> = {
  billing_subscriptions: [],
  billing_customers: [],
  payment_webhook_events: [],
};

let idSeq = 0;

function violates(table: string, row: Row, ignoreId?: unknown): boolean {
  for (const keys of UNIQUE[table] ?? []) {
    if (keys.some((k) => row[k] === null || row[k] === undefined)) continue;
    const clash = db[table].some(
      (r) => r.id !== ignoreId && keys.every((k) => r[k] === row[k]),
    );
    if (clash) return true;
  }
  return false;
}

function matches(row: Row, filters: [string, unknown][]): boolean {
  return filters.every(([k, v]) => row[k] === v);
}

function query(table: string) {
  const filters: [string, unknown][] = [];
  let mode: "select" | "insert" | "update" | "upsert" = "select";
  let payload: Row = {};
  let conflict: string[] = [];

  const run = () => {
    if (mode === "select") {
      return { data: db[table].filter((r) => matches(r, filters)), error: null };
    }
    if (mode === "insert") {
      const row = { id: `row_${++idSeq}`, ...payload };
      if (violates(table, row)) return { data: null, error: { code: "23505" } };
      db[table].push(row);
      return { data: [row], error: null };
    }
    if (mode === "upsert") {
      const existing = db[table].find((r) =>
        conflict.every((k) => r[k] === payload[k]),
      );
      if (existing) {
        Object.assign(existing, payload);
        return { data: [existing], error: null };
      }
      const row = { id: `row_${++idSeq}`, ...payload };
      if (violates(table, row)) return { data: null, error: { code: "23505" } };
      db[table].push(row);
      return { data: [row], error: null };
    }
    // update
    const hits = db[table].filter((r) => matches(r, filters));
    for (const r of hits) {
      const merged = { ...r, ...payload };
      if (violates(table, merged, r.id)) return { data: null, error: { code: "23505" } };
      Object.assign(r, payload);
    }
    return { data: hits, error: null };
  };

  const builder: Record<string, unknown> = {
    select() {
      if (mode === "select") mode = "select";
      return builder;
    },
    insert(rows: Row) {
      mode = "insert";
      payload = rows;
      return builder;
    },
    update(patch: Row) {
      mode = "update";
      payload = patch;
      return builder;
    },
    upsert(row: Row, opts?: { onConflict?: string }) {
      mode = "upsert";
      payload = row;
      conflict = (opts?.onConflict ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      return builder;
    },
    eq(k: string, v: unknown) {
      filters.push([k, v]);
      return builder;
    },
    maybeSingle() {
      const { data, error } = run();
      if (error) return Promise.resolve({ data: null, error });
      const rows = (data ?? []) as Row[];
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve(run()).then(resolve);
    },
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => query(table) }),
}));

// Imported AFTER the mock so the store binds to the fake client.
const {
  recordWebhookEvent,
  markWebhookProcessed,
  upsertSubscription,
  upsertBillingCustomer,
  applyInvoicePayment,
  getBillingCustomerId,
} = await import("@/lib/billing/subscription-store");
const {
  parseCheckoutSessionObject,
  parseSubscriptionObject,
  parseInvoiceObject,
} = await import("@/lib/billing/webhook-core");
const { resolveEntitlements, entitlementAllows } = await import(
  "@/lib/billing/entitlements-v1"
);

// ── Stripe payload shapes (API 2026-05-27.dahlia) ────────────────────────────

const OWNER = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "cus_test_1";
const PLAN = "company_pilot";

const periodStart = Math.floor(Date.parse("2026-07-01T00:00:00Z") / 1000);
const periodEnd = Math.floor(Date.parse("2026-08-01T00:00:00Z") / 1000);

function checkoutSession(subId: string) {
  return {
    id: "cs_test_1",
    object: "checkout.session",
    customer: CUSTOMER,
    subscription: subId,
    client_reference_id: OWNER,
    metadata: { plan_key: PLAN, client_reference_id: OWNER, test_mode: "true" },
  };
}

function subscription(subId: string, status: string, extra: Row = {}) {
  return {
    id: subId,
    object: "subscription",
    customer: CUSTOMER,
    status,
    cancel_at_period_end: false,
    // Since 2025-04-30.basil the period lives on the ITEM, not the subscription.
    items: {
      object: "list",
      data: [
        {
          id: "si_1",
          current_period_start: periodStart,
          current_period_end: periodEnd,
        },
      ],
    },
    // Set by subscription_data.metadata at checkout — without it the whole
    // chain depends on event ordering.
    metadata: { plan_key: PLAN, client_reference_id: OWNER, test_mode: "true" },
    ...extra,
  };
}

function invoice(subId: string) {
  return {
    id: "in_test_1",
    object: "invoice",
    // Since 2025-04-30.basil `invoice.subscription` is gone.
    parent: {
      type: "subscription_details",
      subscription_details: { subscription: subId, metadata: {} },
    },
  };
}

/** The server read path, reduced to what the entitlement resolver needs. */
async function currentEntitlement(now = new Date("2026-07-15T00:00:00Z")) {
  const rows = db.billing_subscriptions.filter((r) => r.owner_id === OWNER);
  const real = rows.find(
    (r) => !String(r.provider_subscription_id ?? "").startsWith("manual_"),
  );
  const ctx = resolveEntitlements({
    billingActive: true,
    isAdmin: false,
    audience: "company",
    subscriptionPlanKey: (real?.plan_key as string) ?? null,
    subscriptionStatus: (real?.status as never) ?? null,
    manualOverridePlanKey: null,
    currentPeriodEnd: (real?.current_period_end as string) ?? null,
    now,
  });
  return { ctx, canBook: entitlementAllows(ctx, "booking_requests") };
}

/** Deliver one verified webhook event through the same branches as the route. */
async function deliver(type: string, object: Row, eventId: string) {
  const recorded = await recordWebhookEvent({
    eventId,
    eventType: type,
    testMode: true,
    payload: { id: eventId, type },
  });
  if (recorded === "duplicate") return "duplicate";

  let result: string = "ok";
  if (type === "checkout.session.completed") {
    const link = parseCheckoutSessionObject(object, true)!;
    await upsertBillingCustomer({
      ownerId: link.ownerId,
      providerCustomerId: link.providerCustomerId,
      testMode: true,
    });
    result = await upsertSubscription(
      {
        providerSubscriptionId: link.providerSubscriptionId,
        providerCustomerId: link.providerCustomerId,
        ownerId: link.ownerId,
        planKey: link.planKey,
        status: "incomplete",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        testMode: true,
      },
      { fromLink: true },
    );
  } else if (type.startsWith("customer.subscription.")) {
    const sub = parseSubscriptionObject(object, true)!;
    await upsertBillingCustomer({
      ownerId: sub.ownerId,
      providerCustomerId: sub.providerCustomerId,
      testMode: true,
    });
    result = await upsertSubscription(
      type === "customer.subscription.deleted" ? { ...sub, status: "cancelled" } : sub,
    );
  } else if (type === "invoice.paid" || type === "invoice.payment_succeeded") {
    const inv = parseInvoiceObject(object, true);
    result = await applyInvoicePayment(inv.providerSubscriptionId, inv.lastPaymentStatus);
  } else if (type === "invoice.payment_failed") {
    const inv = parseInvoiceObject(object, false);
    result = await applyInvoicePayment(inv.providerSubscriptionId, inv.lastPaymentStatus);
  }
  await markWebhookProcessed(eventId, result === "ok" ? undefined : result);
  return result;
}

beforeEach(() => {
  for (const k of Object.keys(db)) db[k] = [];
  idSeq = 0;
});

describe("commercial chain — new user to paid access and back", () => {
  it("full happy path: checkout → active → entitled, and the customer is linked", async () => {
    expect((await currentEntitlement()).canBook).toBe(false);

    await deliver("checkout.session.completed", checkoutSession("sub_1"), "evt_1");
    await deliver("customer.subscription.created", subscription("sub_1", "incomplete"), "evt_2");
    await deliver("customer.subscription.updated", subscription("sub_1", "active"), "evt_3");
    await deliver("invoice.paid", invoice("sub_1"), "evt_4");

    const { ctx, canBook } = await currentEntitlement();
    expect(ctx.effectivePlanKey).toBe(PLAN);
    expect(ctx.active).toBe(true);
    expect(canBook).toBe(true);

    // The portal is addressed by customer id — without this row there is no
    // way for the subscriber to cancel or change a card.
    expect(await getBillingCustomerId(OWNER)).toBe(CUSTOMER);

    const row = db.billing_subscriptions[0];
    expect(row.status).toBe("active");
    expect(row.last_payment_status).toBe("succeeded");
    // Period parsed from items.data[] — null before this audit.
    expect(row.current_period_end).toBe("2026-08-01T00:00:00.000Z");
  });

  it("entitlement survives sign-out/sign-in (it is re-derived from stored rows)", async () => {
    await deliver("checkout.session.completed", checkoutSession("sub_1"), "evt_1");
    await deliver("customer.subscription.updated", subscription("sub_1", "active"), "evt_2");

    // A new session reads the same rows — nothing is held in memory.
    const first = await currentEntitlement();
    const second = await currentEntitlement();
    expect(first.canBook).toBe(true);
    expect(second.canBook).toBe(true);
  });

  it("DEFECT: out-of-order checkout.session.completed no longer downgrades an active subscriber", async () => {
    // Stripe does not guarantee order: the activation lands first.
    await deliver("customer.subscription.updated", subscription("sub_1", "active"), "evt_1");
    await deliver("checkout.session.completed", checkoutSession("sub_1"), "evt_2");

    expect(db.billing_subscriptions[0].status).toBe("active");
    expect((await currentEntitlement()).canBook).toBe(true);
  });

  it("DEFECT: a subscription event alone (no checkout) still links owner+plan via subscription metadata", async () => {
    await deliver("customer.subscription.created", subscription("sub_1", "active"), "evt_1");
    const row = db.billing_subscriptions[0];
    expect(row?.owner_id).toBe(OWNER);
    expect(row?.plan_key).toBe(PLAN);
    expect((await currentEntitlement()).canBook).toBe(true);
  });

  it("duplicate delivery of a settled event is not reprocessed", async () => {
    await deliver("checkout.session.completed", checkoutSession("sub_1"), "evt_1");
    const again = await deliver("checkout.session.completed", checkoutSession("sub_1"), "evt_1");
    expect(again).toBe("duplicate");
    expect(db.billing_subscriptions).toHaveLength(1);
  });

  it("a FAILED event is retried, not swallowed as a duplicate", async () => {
    await recordWebhookEvent({
      eventId: "evt_retry",
      eventType: "customer.subscription.updated",
      testMode: true,
      payload: {},
    });
    await markWebhookProcessed("evt_retry", "error"); // first attempt failed

    const second = await recordWebhookEvent({
      eventId: "evt_retry",
      eventType: "customer.subscription.updated",
      testMode: true,
      payload: {},
    });
    expect(second).toBe("ok");
  });

  it("failed payment → past_due (entitled, bounded), retry succeeds → active", async () => {
    await deliver("checkout.session.completed", checkoutSession("sub_1"), "evt_1");
    await deliver("customer.subscription.updated", subscription("sub_1", "active"), "evt_2");

    await deliver("invoice.payment_failed", invoice("sub_1"), "evt_3");
    expect(db.billing_subscriptions[0].status).toBe("past_due");
    // Inside the grace window the customer keeps access…
    expect((await currentEntitlement(new Date("2026-08-03T00:00:00Z"))).canBook).toBe(true);
    // …and loses it once the bounded window has passed.
    expect((await currentEntitlement(new Date("2026-09-01T00:00:00Z"))).canBook).toBe(false);

    // Stripe retries and the card works: access is restored.
    await deliver("invoice.paid", invoice("sub_1"), "evt_4");
    expect(db.billing_subscriptions[0].status).toBe("active");
    expect((await currentEntitlement()).canBook).toBe(true);
  });

  it("DEFECT: a failed payment actually reaches the subscription (invoice.parent shape)", async () => {
    await deliver("checkout.session.completed", checkoutSession("sub_1"), "evt_1");
    await deliver("customer.subscription.updated", subscription("sub_1", "active"), "evt_2");
    await deliver("invoice.payment_failed", invoice("sub_1"), "evt_3");
    expect(db.billing_subscriptions[0].last_payment_status).toBe("failed");
  });

  it("cancellation removes paid access", async () => {
    await deliver("checkout.session.completed", checkoutSession("sub_1"), "evt_1");
    await deliver("customer.subscription.updated", subscription("sub_1", "active"), "evt_2");
    await deliver("customer.subscription.deleted", subscription("sub_1", "canceled"), "evt_3");

    expect(db.billing_subscriptions[0].status).toBe("cancelled");
    expect((await currentEntitlement()).canBook).toBe(false);
  });

  it("DEFECT: re-subscribing after cancellation restores access (unique owner+plan+provider)", async () => {
    await deliver("checkout.session.completed", checkoutSession("sub_1"), "evt_1");
    await deliver("customer.subscription.updated", subscription("sub_1", "active"), "evt_2");
    await deliver("customer.subscription.deleted", subscription("sub_1", "canceled"), "evt_3");

    // A NEW Stripe subscription for the SAME owner+plan — this used to hit
    // 23505, be reported as "error", and be acknowledged with HTTP 200.
    const r1 = await deliver("checkout.session.completed", checkoutSession("sub_2"), "evt_4");
    const r2 = await deliver("customer.subscription.updated", subscription("sub_2", "active"), "evt_5");
    expect(r1).toBe("ok");
    expect(r2).toBe("ok");

    expect(db.billing_subscriptions).toHaveLength(1);
    const row = db.billing_subscriptions[0];
    expect(row.provider_subscription_id).toBe("sub_2");
    expect(row.status).toBe("active");
    expect((await currentEntitlement()).canBook).toBe(true);
  });

  it("DEFECT: a paused subscription does NOT keep paid access", async () => {
    await deliver("checkout.session.completed", checkoutSession("sub_1"), "evt_1");
    await deliver("customer.subscription.updated", subscription("sub_1", "active"), "evt_2");
    await deliver("customer.subscription.updated", subscription("sub_1", "paused"), "evt_3");

    expect(db.billing_subscriptions[0].status).toBe("unpaid");
    expect((await currentEntitlement()).canBook).toBe(false);
  });

  it("DEFECT: pause_collection (status stays active) does NOT keep paid access", async () => {
    await deliver("checkout.session.completed", checkoutSession("sub_1"), "evt_1");
    await deliver(
      "customer.subscription.updated",
      subscription("sub_1", "active", { pause_collection: { behavior: "void" } }),
      "evt_2",
    );
    expect(db.billing_subscriptions[0].status).toBe("unpaid");
    expect((await currentEntitlement()).canBook).toBe(false);
  });

  it("a stray invoice event never resurrects a cancelled subscription", async () => {
    await deliver("checkout.session.completed", checkoutSession("sub_1"), "evt_1");
    await deliver("customer.subscription.updated", subscription("sub_1", "active"), "evt_2");
    await deliver("customer.subscription.deleted", subscription("sub_1", "canceled"), "evt_3");
    await deliver("invoice.paid", invoice("sub_1"), "evt_4");

    expect(db.billing_subscriptions[0].status).toBe("cancelled");
    expect((await currentEntitlement()).canBook).toBe(false);
  });

  it("upgrade to another plan keeps exactly one entitling subscription per plan", async () => {
    await deliver("checkout.session.completed", checkoutSession("sub_1"), "evt_1");
    await deliver("customer.subscription.updated", subscription("sub_1", "active"), "evt_2");

    // Stripe reports the plan change on the same subscription id.
    const upgraded = {
      ...subscription("sub_1", "active"),
      metadata: { plan_key: "agency_pilot", client_reference_id: OWNER },
    };
    await deliver("customer.subscription.updated", upgraded, "evt_3");

    expect(db.billing_subscriptions).toHaveLength(1);
    expect(db.billing_subscriptions[0].plan_key).toBe("agency_pilot");
  });
});
