/**
 * Subscription store — billing safety v1 additions, against the scripted fake
 * service-role client:
 *
 *   1. ORDERING: a stale event returns "stale-event" and writes nothing; a
 *      LINK event on an existing row keeps the status; a terminal row is not
 *      revived; the evidence columns ride with the write.
 *   2. FALLBACK: when the safety columns are not applied (42703 on the write
 *      that carries them) the signed state is persisted WITHOUT them; the
 *      org-binding needs-migration rule is untouched.
 *   3. recordWebhookEvent retries without event_created_at on 42703.
 *   4. findScopedSubscription scopes by subject AND mode.
 *   5. applyProviderReconciledStatus writes only dead statuses (typed) and
 *      stamps its provenance.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  applyInvoicePayment,
  applyProviderReconciledStatus,
  findScopedSubscription,
  recordWebhookEvent,
  upsertSubscription,
} from "./subscription-store";
import type { SubscriptionUpsert } from "./webhook-core";

interface Call {
  table: string;
  op: "insert" | "update" | "upsert" | "select";
  args: unknown[];
  filters: Array<[string, unknown]>;
}
type Outcome = { data?: unknown; error?: { code?: string } | null };

function installFakeAdmin(handler: (call: Call) => Outcome): Call[] {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const make = (op: Call["op"], args: unknown[]) => {
        const call: Call = { table, op, args, filters: [] };
        calls.push(call);
        const finish = () => {
          const out = handler(call);
          return { data: out.data ?? null, error: out.error ?? null };
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {
          eq(c: string, v: unknown) { call.filters.push([c, v]); return b; },
          is(c: string, v: unknown) { call.filters.push([c, v]); return b; },
          order() { return b; },
          limit() { return b; },
          maybeSingle: () => Promise.resolve(finish()),
          then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) {
            return Promise.resolve(finish()).then(ok, err);
          },
        };
        return b;
      };
      return {
        insert: (...a: unknown[]) => make("insert", a),
        update: (...a: unknown[]) => make("update", a),
        upsert: (...a: unknown[]) => make("upsert", a),
        select: (...a: unknown[]) => make("select", a),
      };
    },
  };
  vi.mocked(createAdminClient).mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
  return calls;
}

const T0 = 1_757_000_000;
const iso = (u: number) => new Date(u * 1000).toISOString();

const SUB: SubscriptionUpsert = {
  providerSubscriptionId: "sub_1",
  providerCustomerId: "cus_1",
  ownerId: "owner_1",
  planKey: "company_pilot",
  organizationId: "org_1",
  status: "active",
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  testMode: false,
  eventId: "evt_new",
  eventCreated: T0,
  providerPriceId: "price_99",
  unitAmountCents: 9900,
  currency: "eur",
};

const EXISTING = {
  id: "row_1", owner_id: "owner_1", plan_key: "company_pilot", provider_customer_id: "cus_1",
  status: "active", last_event_created_at: iso(T0),
};

beforeEach(() => vi.clearAllMocks());

describe("upsertSubscription — ordering", () => {
  it("an OLDER event → stale-event, NO write", async () => {
    const calls = installFakeAdmin((c) => (c.op === "select" ? { data: EXISTING } : {}));
    const r = await upsertSubscription({ ...SUB, status: "incomplete", eventCreated: T0 - 30 });
    expect(r).toBe("stale-event");
    expect(calls.filter((c) => c.op !== "select")).toHaveLength(0);
  });

  it("a LINK event on an existing ACTIVE row keeps status/period (linkage only) — never active → incomplete", async () => {
    const calls = installFakeAdmin((c) => (c.op === "select" ? { data: EXISTING } : {}));
    const r = await upsertSubscription({ ...SUB, status: "incomplete", transitionKind: "link", eventCreated: T0 + 5 });
    expect(r).toBe("ok");
    const up = calls.find((c) => c.op === "upsert")!;
    const row = up.args[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty("status");
    expect(row).not.toHaveProperty("current_period_end");
    expect(row.provider_customer_id).toBe("cus_1");
    expect(row.organization_id).toBe("org_1");
  });

  it("a terminal row is never revived", async () => {
    installFakeAdmin((c) => (c.op === "select" ? { data: { ...EXISTING, status: "cancelled", last_event_created_at: null } } : {}));
    expect(await upsertSubscription({ ...SUB, eventCreated: null })).toBe("stale-event");
  });

  it("a NEWER event applies and carries the evidence columns", async () => {
    const calls = installFakeAdmin((c) => (c.op === "select" ? { data: EXISTING } : {}));
    expect(await upsertSubscription({ ...SUB, status: "past_due", eventCreated: T0 + 60, eventId: "evt_later" })).toBe("ok");
    const row = calls.find((c) => c.op === "upsert")!.args[0] as Record<string, unknown>;
    expect(row.status).toBe("past_due");
    expect(row.last_event_id).toBe("evt_later");
    expect(row.last_event_created_at).toBe(iso(T0 + 60));
    expect(row.provider_price_id).toBe("price_99");
    expect(row.unit_amount_cents).toBe(9900);
    expect(row.currency).toBe("eur");
  });

  it("a fresh row applies (no existing) and the legacy caller shape still works", async () => {
    const calls = installFakeAdmin((c) => (c.op === "select" ? { data: null } : {}));
    const legacy: SubscriptionUpsert = { ...SUB, eventId: undefined, eventCreated: undefined, providerPriceId: undefined, unitAmountCents: undefined, currency: undefined };
    expect(await upsertSubscription(legacy)).toBe("ok");
    const row = calls.find((c) => c.op === "upsert")!.args[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty("last_event_created_at");
    expect(row).not.toHaveProperty("provider_price_id");
    expect(row.status).toBe("active");
  });
});

describe("upsertSubscription — safety columns not applied (42703)", () => {
  it("SELECT of last_event_created_at fails 42703 → legacy select; write retried WITHOUT the safety columns", async () => {
    let selects = 0;
    let upserts = 0;
    const calls = installFakeAdmin((c) => {
      if (c.op === "select") { selects += 1; return selects === 1 ? { error: { code: "42703" } } : { data: { ...EXISTING, last_event_created_at: undefined } }; }
      if (c.op === "upsert") { upserts += 1; return {}; }
      return {};
    });
    expect(await upsertSubscription(SUB)).toBe("ok");
    const row = calls.find((c) => c.op === "upsert")!.args[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty("last_event_created_at");
    expect(row).not.toHaveProperty("provider_price_id");
    expect(row.organization_id).toBe("org_1"); // the org binding is NEVER stripped
    expect(upserts).toBe(1);
  });

  it("write with safety columns fails 42703 → retried without them; a second 42703 (org column absent) → needs-migration", async () => {
    let upserts = 0;
    installFakeAdmin((c) => {
      if (c.op === "select") return { data: EXISTING };
      if (c.op === "upsert") { upserts += 1; return upserts === 1 ? { error: { code: "42703" } } : {}; }
      return {};
    });
    expect(await upsertSubscription(SUB)).toBe("ok");
    expect(upserts).toBe(2);

    upserts = 0;
    installFakeAdmin((c) => {
      if (c.op === "select") return { data: EXISTING };
      if (c.op === "upsert") { upserts += 1; return { error: { code: "42703" } }; }
      return {};
    });
    expect(await upsertSubscription(SUB)).toBe("needs-migration");
    expect(upserts).toBe(2);
  });
});

describe("applyInvoicePayment — ordering", () => {
  it("an old invoice.payment_failed never drags a newer ACTIVE row to past_due", async () => {
    const calls = installFakeAdmin((c) => (c.op === "select" ? { data: EXISTING } : {}));
    expect(await applyInvoicePayment("sub_1", "failed", { id: "evt_old", created: T0 - 100 })).toBe("stale-event");
    expect(calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("a newer failure applies past_due + evidence; legacy callers (no event) still apply", async () => {
    const calls = installFakeAdmin((c) => (c.op === "select" ? { data: EXISTING } : {}));
    expect(await applyInvoicePayment("sub_1", "failed", { id: "evt_f", created: T0 + 10 })).toBe("ok");
    const patch = calls.find((c) => c.op === "update")!.args[0] as Record<string, unknown>;
    expect(patch.status).toBe("past_due");
    expect(patch.last_event_id).toBe("evt_f");
    installFakeAdmin((c) => (c.op === "select" ? { data: EXISTING } : {}));
    expect(await applyInvoicePayment("sub_1", "succeeded")).toBe("ok");
  });
});

describe("recordWebhookEvent — event_created_at fallback", () => {
  it("42703 on the insert carrying event_created_at → retried without it → ok", async () => {
    let inserts = 0;
    const calls = installFakeAdmin((c) => {
      if (c.op === "insert") { inserts += 1; return inserts === 1 ? { error: { code: "42703" } } : {}; }
      return {};
    });
    const r = await recordWebhookEvent({ eventId: "evt_1", eventType: "invoice.paid", testMode: false, payload: {}, eventCreated: T0 });
    expect(r).toBe("ok");
    expect(calls[0].args[0]).toEqual(expect.objectContaining({ event_created_at: iso(T0) }));
    expect(calls[1].args[0]).not.toHaveProperty("event_created_at");
  });
});

describe("findScopedSubscription", () => {
  it("organization scope filters organization_id + plan + MODE", async () => {
    const calls = installFakeAdmin(() => ({ data: { provider_subscription_id: "sub_1", status: "active", test_mode: false } }));
    const r = await findScopedSubscription({ scope: { type: "organization", id: "org_1" }, planKey: "company_pilot", testMode: false });
    expect(r).toEqual({ status: "found", row: { providerSubscriptionId: "sub_1", status: "active", testMode: false } });
    expect(calls[0].filters).toEqual(expect.arrayContaining([["organization_id", "org_1"], ["plan_key", "company_pilot"], ["test_mode", false]]));
  });

  it("personal scope filters owner_id + origin_organization_id IS NULL", async () => {
    const calls = installFakeAdmin(() => ({ data: null }));
    expect(await findScopedSubscription({ scope: { type: "profile", id: "p1" }, planKey: "company_pilot", testMode: true })).toEqual({ status: "none" });
    expect(calls[0].filters).toEqual(expect.arrayContaining([["owner_id", "p1"], ["origin_organization_id", null]]));
  });

  it("42P01 / 42703 → needs-migration; other errors → error", async () => {
    installFakeAdmin(() => ({ error: { code: "42P01" } }));
    expect(await findScopedSubscription({ scope: { type: "profile", id: "p1" }, planKey: "x", testMode: true })).toEqual({ status: "needs-migration" });
    installFakeAdmin(() => ({ error: { code: "XX000" } }));
    expect(await findScopedSubscription({ scope: { type: "profile", id: "p1" }, planKey: "x", testMode: true })).toEqual({ status: "error" });
  });
});

describe("applyProviderReconciledStatus — the one heal write", () => {
  it("writes the dead status with provenance; falls back without the evidence columns on 42703", async () => {
    let updates = 0;
    const calls = installFakeAdmin(() => { updates += 1; return updates === 1 ? { error: { code: "42703" } } : {}; });
    expect(await applyProviderReconciledStatus({ providerSubscriptionId: "sub_1", status: "cancelled", source: "checkout_admission" })).toBe("ok");
    const first = calls[0].args[0] as Record<string, unknown>;
    expect(first.status).toBe("cancelled");
    expect(first.last_event_id).toBe("reconcile:checkout_admission");
    const second = calls[1].args[0] as Record<string, unknown>;
    expect(second).not.toHaveProperty("last_event_id");
    expect(calls[0].filters).toEqual(expect.arrayContaining([["provider_subscription_id", "sub_1"]]));
  });
});
