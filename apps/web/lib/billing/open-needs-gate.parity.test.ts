/**
 * ENTITLEMENT PARITY (WEB / MCP / mobile) — the open-needs gate takes ONE
 * decision from (client, profile, organization) with NO cookie session. A
 * bearer caller (no cookie) must get the same plan/limit verdict as the web
 * caller for the same organization; billing off stays permissive.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  cookieUser: null as { id: string } | null, // a bearer request has no cookie session
  config: { state: "stripe_live", reason: "ok", testMode: false, paymentsEnabled: true, mode: "live" } as Record<string, unknown>,
  subsByOrg: {} as Record<string, Array<Record<string, unknown>>>,
  activeNeeds: 0,
  needsReadFails: false,
  orgFiltersSeen: [] as unknown[],
}));

function client(kind: "user" | "admin") {
  return {
    auth: { getUser: async () => ({ data: { user: state.cookieUser } }) },
    from(table: string) {
      const f: Record<string, unknown> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select() { return b; },
        eq(c: string, v: unknown) { f[c] = v; return b; },
        is() { return b; }, order() { return b; }, in() { return b; }, or() { return b; },
        then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) {
          let out: unknown;
          if (table === "profile_roles") out = { data: [{ role: "company" }], error: null };
          else if (table === "billing_subscriptions") {
            state.orgFiltersSeen.push(f.organization_id);
            out = { data: state.subsByOrg[String(f.organization_id)] ?? [], error: null };
          } else if (table === "customer_requests") {
            out = state.needsReadFails ? { count: null, error: { code: "x" } } : { count: state.activeNeeds, error: null };
          } else out = { data: [], error: null };
          void kind;
          return Promise.resolve(out).then(ok, err);
        },
      };
      return b;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => client("user")) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => client("admin")) }));
vi.mock("@/lib/auth/superadmin", () => ({
  isSuperadmin: vi.fn(async () => false),
  isSuperadminFor: vi.fn(async () => false),
}));
vi.mock("@/lib/billing/config", () => ({ getBillingConfig: () => state.config }));
vi.mock("@/lib/billing/billing-subject", () => ({
  // the cookie workspace resolver: a bearer request has none
  resolveBillingSubject: vi.fn(async () => ({ subject: null })),
}));

import { gateOpenNeeds } from "./open-needs-gate";

const PAID = { plan_key: "company_pilot", status: "active", provider_subscription_id: "sub_1", updated_at: "2026-10-01T00:00:00Z" };
const bearer = () => client("user") as never;

beforeEach(() => {
  state.cookieUser = null;
  state.config = { state: "stripe_live", reason: "ok", testMode: false, paymentsEnabled: true, mode: "live" };
  state.subsByOrg = {};
  state.activeNeeds = 0;
  state.needsReadFails = false;
  state.orgFiltersSeen = [];
});

describe("gateOpenNeeds without a cookie session (bearer / MCP / mobile)", () => {
  it("billing not enforced: unchanged, permissive", async () => {
    state.config = { state: "disabled", reason: "off", testMode: false, paymentsEnabled: false, mode: "off" };
    const g = await gateOpenNeeds(bearer(), "org-1", "u-1");
    expect(g.allowed).toBe(true);
    expect(g.allowed && g.enforced).toBe(false);
  });

  it("enforced + FREE organization at its cap: refused with the upgrade step (not a free_worker refusal)", async () => {
    state.activeNeeds = 1;
    const g = await gateOpenNeeds(bearer(), "org-1", "u-1");
    expect(g.allowed).toBe(false);
    if (!g.allowed) {
      expect(g.planKey).toBe("free_organization");
      expect(g.limit).toBe(1);
      expect(g.next).toBe("upgrade");
    }
  });

  it("enforced + FREE organization under its cap: allowed (the first need)", async () => {
    state.activeNeeds = 0;
    const g = await gateOpenNeeds(bearer(), "org-1", "u-1");
    expect(g.allowed).toBe(true);
  });

  it("enforced + PAID organization: allowed up to 10, the 11th goes to the individual plan", async () => {
    state.subsByOrg["org-1"] = [PAID];
    state.activeNeeds = 9;
    expect((await gateOpenNeeds(bearer(), "org-1", "u-1")).allowed).toBe(true);
    state.activeNeeds = 10;
    const g = await gateOpenNeeds(bearer(), "org-1", "u-1");
    expect(g.allowed).toBe(false);
    if (!g.allowed) expect(g.next).toBe("individual_plan");
  });

  it("cross-org: another organization's paid plan never entitles this organization", async () => {
    state.subsByOrg["org-other"] = [PAID];
    state.activeNeeds = 1;
    const g = await gateOpenNeeds(bearer(), "org-1", "u-1");
    expect(g.allowed).toBe(false);
    expect(state.orgFiltersSeen).toEqual(["org-1"]);
  });

  it("an unreadable count fails closed once enforced", async () => {
    state.subsByOrg["org-1"] = [PAID];
    state.needsReadFails = true;
    expect((await gateOpenNeeds(bearer(), "org-1", "u-1")).allowed).toBe(false);
  });

  it("parity: a web caller (cookie user present) and a bearer caller get the SAME verdict for the same organization", async () => {
    state.subsByOrg["org-1"] = [PAID];
    state.activeNeeds = 10;
    const bearerVerdict = await gateOpenNeeds(bearer(), "org-1", "u-1");
    state.cookieUser = { id: "u-1" };
    const webVerdict = await gateOpenNeeds(client("user") as never, "org-1", "u-1");
    expect(webVerdict).toEqual(bearerVerdict);
  });
});

describe("authority: the organization id is never caller-asserted", () => {
  it("the MCP lifecycle/create paths derive the organization from the membership-proven employer gate before the billing gate", async () => {
    const { readFileSync } = await import("node:fs");
    const ops = readFileSync("lib/capabilities/employer-operations-capabilities.ts", "utf8");
    expect(ops).toContain("requireEmployerCompanyForCaller");
    expect(ops).toContain("organizationId: employer.organizationId");
    const demand = readFileSync("lib/demand/demand-request.ts", "utf8");
    expect(demand).toContain("gateOpenNeeds(supabase, employer.organizationId, caller.userId)");
  });
});
