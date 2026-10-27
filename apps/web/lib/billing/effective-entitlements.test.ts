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
vi.mock("@/lib/auth/superadmin", () => ({
  isSuperadmin: vi.fn(async () => false),
  isSuperadminFor: vi.fn(async () => false),
}));
vi.mock("@/lib/billing/config", () => ({
  getBillingConfig: () => state.config,
  getBillingConfigFor: () => state.config,
}));
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

describe("explicit caller (bearer / MCP) — no cookie session, the caller's own organization", () => {
  it("resolves the caller's organization plan even though the cookie session has NO user (defect 2026-09-30)", async () => {
    state.user = null; // a bearer request carries no cookie session
    state.subject = { subject: null };
    state.handler = (c) => (c.table === "billing_subscriptions" ? { data: [ORG_ROW] } : { data: [] });
    const caller = { supabase: fakeClient("user") as never, userId: "manager-1", organizationId: "org-7" };
    const ctx = await getEffectiveEntitlements(caller);
    expect(ctx.profileId).toBe("manager-1");
    expect(ctx.effectivePlanKey).toBe("company_pilot");
    const sub = state.calls.find((c) => c.table === "billing_subscriptions")!;
    expect(sub.client).toBe("admin");
    expect(sub.filters).toContainEqual(["organization_id", "org-7"]);
  });
});

describe("owner-granted organization VIP (#2474, matrix 7.27) — an approved organization's LIVE workspace resolves it", () => {
  const VIP_ROW = { organization_id: "org-1", grant_kind: "vip", scope: { profile_views: null }, revoked_at: null };
  /** A reader that answers each table only for the exact scope the resolver must ask for. */
  const vipHandler = (subscriptions: unknown[] = []) => (c: Call): Outcome => {
    const f = filtersOf(c);
    if (c.table === "organization_access_grants") {
      return c.client === "admin" && f.organization_id === "org-1" && f.grant_kind === "vip" && f.revoked_at === null
        ? { data: [VIP_ROW] }
        : { data: [] };
    }
    if (c.table === "billing_subscriptions") {
      return f.organization_id === "org-1" && f.test_mode === false ? { data: subscriptions } : { data: [] };
    }
    return { data: [] };
  };
  const grantReads = () => state.calls.filter((c) => c.table === "organization_access_grants");

  it("LIVE mode: the organization plan as an explicit override, read by the organization id with NO mode filter", async () => {
    state.handler = vipHandler();
    const ent = await getEffectiveEntitlements();
    expect(ent.effectivePlanKey).toBe("company_pilot");
    expect(ent.source).toBe("manual_override");
    expect(ent.active).toBe(true);
    expect(ent.enforced).toBe(true);
    const reads = grantReads();
    expect(reads).toHaveLength(1);
    expect(reads[0]!.client).toBe("admin");
    expect(filtersOf(reads[0]!)).toEqual({ organization_id: "org-1", grant_kind: "vip", revoked_at: null });
  });

  it("reproduces the 7.27 defect: the org-less TEST-mode pilot override row never reaches a live organization workspace", async () => {
    // The admin pilot override writes owner_id + organization_id NULL + test_mode true. The
    // organization read asks for organization_id = org-1 AND test_mode = false, so it is invisible.
    const PILOT_OVERRIDE = { plan_key: "company_pilot", status: "active", provider_subscription_id: "manual_x", organization_id: null, test_mode: true };
    state.handler = (c) => {
      const f = filtersOf(c);
      return c.table === "billing_subscriptions" && f.test_mode === true && f.organization_id === undefined
        ? { data: [PILOT_OVERRIDE] }
        : { data: [] };
    };
    const before = await getEffectiveEntitlements();
    expect(before.source).toBe("free");
    expect(before.effectivePlanKey).toBe("free_organization");

    state.calls = [];
    state.handler = vipHandler();
    const after = await getEffectiveEntitlements();
    expect(after.effectivePlanKey).toBe("company_pilot");
    expect(after.active).toBe(true);
  });

  it("the same grant holds under stripe_test and with billing off (it is not a payment)", async () => {
    state.handler = vipHandler();
    state.config = { state: "stripe_test", reason: "ok", testMode: true, paymentsEnabled: true, mode: "test" };
    expect((await getEffectiveEntitlements()).effectivePlanKey).toBe("company_pilot");
    state.config = { state: "disabled", reason: "off", testMode: true, paymentsEnabled: false, mode: "off" };
    const off = await getEffectiveEntitlements();
    expect(off.effectivePlanKey).toBe("company_pilot");
    expect(off.enforced).toBe(false);
  });

  it("the explicit-caller (MCP / bearer) door resolves the caller organization's grant too", async () => {
    state.user = null;
    state.subject = { subject: null };
    state.handler = (c) =>
      c.table === "organization_access_grants" && filtersOf(c).organization_id === "org-7"
        ? { data: [{ ...VIP_ROW, organization_id: "org-7" }] }
        : { data: [] };
    const caller = { supabase: fakeClient("user") as never, userId: "manager-1", organizationId: "org-7" };
    const ctx = await getEffectiveEntitlements(caller);
    expect(ctx.effectivePlanKey).toBe("company_pilot");
    expect(ctx.source).toBe("manual_override");
  });

  it("a real paid subscription still wins over the grant (source subscription)", async () => {
    state.handler = vipHandler([ORG_ROW]);
    const ent = await getEffectiveEntitlements();
    expect(ent.source).toBe("subscription");
    expect(ent.effectivePlanKey).toBe("company_pilot");
  });

  it("another organization's grant never entitles this one, even from a sloppy reader", async () => {
    state.handler = (c) =>
      c.table === "organization_access_grants"
        ? { data: [{ ...VIP_ROW, organization_id: "org-2" }] }
        : { data: [] };
    const ent = await getEffectiveEntitlements();
    expect(ent.source).toBe("free");
  });

  it("the personal workspace never reads organization grants (no entitlement transfer)", async () => {
    state.subject = personalSubject;
    state.handler = vipHandler();
    const ent = await getEffectiveEntitlements();
    expect(grantReads()).toHaveLength(0);
    expect(ent.effectivePlanKey).not.toBe("company_pilot");
  });

  it("an unapplied migration (42P01) or any read error is no grant, never a throw", async () => {
    state.handler = (c) => (c.table === "organization_access_grants" ? { error: { code: "42P01" } } : { data: [] });
    const ent = await getEffectiveEntitlements();
    expect(ent.source).toBe("free");
  });
});

describe("organization subject — the fallback plan follows the ORGANIZATION, not a legacy role row", () => {
  it.each([["worker"], ["agency"]])("a member whose profile_roles carry only %s, acting in an organization workspace with no subscription, resolves to ORGANIZATION FREE", async (role) => {
    state.roles = [{ role }];
    state.handler = () => ({ data: [] });
    const ent = await getEffectiveEntitlements();
    expect(ent.effectivePlanKey).toBe("free_organization");
  });

  it("the personal workspace of a worker-only profile keeps the PERSON plan", async () => {
    state.roles = [{ role: "worker" }];
    state.subject = personalSubject;
    state.handler = () => ({ data: [] });
    const ent = await getEffectiveEntitlements();
    expect(ent.effectivePlanKey).toBe("free_worker");
  });
});
