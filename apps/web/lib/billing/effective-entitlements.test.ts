/**
 * Effective entitlements — payments production calm v1 (2026-09-22), every
 * collaborator mocked, against a scripted fake for BOTH Supabase clients.
 *
 * MEASURED defects this pins closed:
 *   1. MODE: the subscription read carried no `test_mode` filter while
 *      admission (`findScopedSubscription`) and the customer lookup did — a
 *      TEST row could entitle a LIVE workspace. Every read now filters by
 *      `config.testMode`.
 *   2. AUTHORITY: `billing_subscriptions` has ONE SELECT policy (owner or
 *      admin). Read through the user client an organization's row was
 *      visible only to the profile that paid, so an organization
 *      CO-MANAGER holding manage-billing resolved as free. The organization
 *      read now goes through the service-role client scoped by the
 *      SERVER-resolved subject; the personal read stays user-scoped.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

interface Call {
  client: "user" | "admin";
  table: string;
  filters: Array<[string, unknown]>;
}
type Outcome = { data?: unknown; error?: { code?: string } | null };

const state = vi.hoisted(() => ({
  user: { id: "member-2", email: "m@example.com" } as { id: string; email: string } | null,
  roles: [{ role: "company" }] as Array<{ role: string }>,
  config: { state: "stripe_live", reason: "ok", testMode: false, paymentsEnabled: true, mode: "live" },
  subject: null as unknown,
  adminThrows: false,
  calls: [] as Call[],
  handler: (() => ({ data: [] })) as (c: Call) => Outcome,
}));

function fakeClient(kind: "user" | "admin") {
  return {
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from(table: string) {
      const call: Call = { client: kind, table, filters: [] };
      state.calls.push(call);
      const finish = () => {
        if (table === "profile_roles") return { data: state.roles, error: null };
        const out = state.handler(call);
        return { data: out.data ?? null, error: out.error ?? null };
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select() { return b; },
        eq(c: string, v: unknown) { call.filters.push([c, v]); return b; },
        is(c: string, v: unknown) { call.filters.push([c, v]); return b; },
        order() { return b; },
        then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) {
          return Promise.resolve(finish()).then(ok, err);
        },
      };
      return b;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => fakeClient("user")) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    if (state.adminThrows) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    return fakeClient("admin");
  }),
}));
vi.mock("@/lib/auth/superadmin", () => ({ isSuperadmin: vi.fn(async () => false) }));
vi.mock("@/lib/billing/config", () => ({ getBillingConfig: () => state.config }));
vi.mock("@/lib/billing/billing-subject", () => ({
  resolveBillingSubject: vi.fn(async () => state.subject),
}));

import { getEffectiveEntitlements } from "./effective-entitlements";

const ORG_ROW = {
  plan_key: "company_pilot",
  status: "active",
  provider_subscription_id: "sub_live_1",
  updated_at: "2026-09-22T08:00:00.000Z",
};

/** The organization's paid row — bought by owner-1, read by someone else. */
const coManagerSubject = {
  subject: { type: "organization", id: "org-1" },
  payerProfileId: "member-2",
  billingAuthority: true,
  role: "admin",
};

const personalSubject = {
  subject: { type: "profile", id: "member-2" },
  payerProfileId: "member-2",
  billingAuthority: true,
  role: null,
};

const subsCalls = () => state.calls.filter((c) => c.table === "billing_subscriptions");
const filtersOf = (c: Call) => Object.fromEntries(c.filters);

beforeEach(() => {
  state.calls = [];
  state.user = { id: "member-2", email: "m@example.com" };
  state.roles = [{ role: "company" }];
  state.config = { state: "stripe_live", reason: "ok", testMode: false, paymentsEnabled: true, mode: "live" };
  state.subject = coManagerSubject;
  state.adminThrows = false;
  state.handler = () => ({ data: [] });
});

describe("organization subject — the co-manager resolves the organization's row", () => {
  it("reads through the service-role client scoped by the server-resolved organization id + adapter mode, never the user client", async () => {
    state.handler = (c) =>
      c.client === "admin" && filtersOf(c).organization_id === "org-1" && filtersOf(c).test_mode === false
        ? { data: [ORG_ROW] }
        : { data: [] };

    const ent = await getEffectiveEntitlements();

    expect(ent.effectivePlanKey).toBe("company_pilot");
    expect(ent.source).toBe("subscription");
    expect(ent.active).toBe(true);
    expect(ent.profileId).toBe("member-2");

    const reads = subsCalls();
    expect(reads).toHaveLength(1);
    expect(reads[0]!.client).toBe("admin");
    expect(filtersOf(reads[0]!)).toEqual({ organization_id: "org-1", test_mode: false });
    // the payer identity plays no part in the organization read
    expect(reads[0]!.filters.map(([k]) => k)).not.toContain("owner_id");
  });

  it("a TEST-mode row does not entitle a LIVE workspace: the mode filter follows the config", async () => {
    // The fake answers ONLY when asked for test rows — a live read must ask for live rows.
    state.handler = (c) => (filtersOf(c).test_mode === true ? { data: [ORG_ROW] } : { data: [] });

    const live = await getEffectiveEntitlements();
    expect(live.source).toBe("free");
    expect(live.effectivePlanKey).not.toBe("company_pilot");

    state.calls = [];
    state.config = { state: "stripe_test", reason: "ok", testMode: true, paymentsEnabled: true, mode: "test" };
    const test = await getEffectiveEntitlements();
    expect(test.effectivePlanKey).toBe("company_pilot");
    expect(filtersOf(subsCalls()[0]!).test_mode).toBe(true);
  });

  it("without a service key the organization read falls back to the user client with the same scope (the purchaser-only floor, never a throw)", async () => {
    state.adminThrows = true;
    state.handler = (c) => (c.client === "user" ? { data: [ORG_ROW] } : { data: [] });

    const ent = await getEffectiveEntitlements();

    expect(ent.effectivePlanKey).toBe("company_pilot");
    const reads = subsCalls();
    expect(reads).toHaveLength(1);
    expect(reads[0]!.client).toBe("user");
    expect(filtersOf(reads[0]!)).toEqual({ organization_id: "org-1", test_mode: false });
  });

  it("an unapplied multi-subject schema (42703) resolves the organization as free instead of throwing", async () => {
    state.handler = () => ({ error: { code: "42703" } });
    const ent = await getEffectiveEntitlements();
    expect(ent.source).toBe("free");
  });
});

describe("personal subject — stays user-scoped (owner_id = auth.uid() IS the policy)", () => {
  it("reads through the user client by owner + mode + personal origin; the admin client is never asked", async () => {
    state.subject = personalSubject;
    state.handler = (c) =>
      c.client === "user" && filtersOf(c).owner_id === "member-2" && filtersOf(c).test_mode === false
        ? { data: [{ ...ORG_ROW, origin_organization_id: null }] }
        : { data: [] };

    const ent = await getEffectiveEntitlements();

    expect(ent.effectivePlanKey).toBe("company_pilot");
    const reads = subsCalls();
    expect(reads).toHaveLength(1);
    expect(reads[0]!.client).toBe("user");
    expect(filtersOf(reads[0]!)).toEqual({ owner_id: "member-2", test_mode: false, origin_organization_id: null });
    expect(state.calls.some((c) => c.client === "admin")).toBe(false);
  });

  it("legacy schema (42703 on origin_organization_id) retries owner + mode only", async () => {
    state.subject = personalSubject;
    state.handler = (c) =>
      c.filters.some(([k]) => k === "origin_organization_id") ? { error: { code: "42703" } } : { data: [ORG_ROW] };

    const ent = await getEffectiveEntitlements();

    expect(ent.effectivePlanKey).toBe("company_pilot");
    const reads = subsCalls();
    expect(reads).toHaveLength(2);
    expect(filtersOf(reads[1]!)).toEqual({ owner_id: "member-2", test_mode: false });
  });
});

describe("unauthenticated", () => {
  it("resolves free without touching either client", async () => {
    state.user = null;
    const ent = await getEffectiveEntitlements();
    expect(ent.profileId).toBeNull();
    expect(subsCalls()).toHaveLength(0);
  });
});
