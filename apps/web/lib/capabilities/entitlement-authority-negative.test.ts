/**
 * NEGATIVE AUTHORITY for the bearer / MCP demand lifecycle (PR #2010).
 *
 * Runs the REAL `requireEmployerCompanyForCaller` + core gate chain and the
 * REAL `demand.*` lifecycle capabilities. Only the membership-validated
 * workspace list and the Supabase tables are scripted. Proves:
 *   - an authenticated bearer caller naming an organization WITHOUT a
 *     governance membership is denied before any write or billing read;
 *   - a caller-supplied organization id never creates authority (strict
 *     input schema; an org outside the validated list is refused);
 *   - billing / LMC is not bypassed: a FREE org at its cap is refused while
 *     enforcement is on, and billing disabled stays permissive.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: <T,>(fn: T) => fn };
});

const state = vi.hoisted(() => ({
  workspaces: [] as Array<{ kind: string; id: string; name: string }>,
  activeId: "org-a",
  tables: {} as Record<string, { data: unknown; error: null }>,
  reads: [] as string[],
  rpcs: [] as string[],
  billing: "stripe_live" as string,
  activeNeedCount: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    throw new Error("cookie client must not be used");
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => makeClient()) }));
vi.mock("@/lib/auth/superadmin", () => ({
  isSuperadmin: vi.fn(async () => false),
  isSuperadminFor: vi.fn(async () => false),
}));
vi.mock("@/lib/billing/config", () => ({
  getBillingConfig: () => ({ state: state.billing, reason: "ok", testMode: false, paymentsEnabled: true, mode: "live" }),
}));
vi.mock("@/lib/auth/session-profile", () => ({
  readProfileRow: async () => ({ ok: true, value: { active_role: "company" } }),
}));
vi.mock("@/lib/company/active-organization", () => ({
  getWorkspaceContext: vi.fn(),
  resolveActiveWorkspaceForCaller: async () => ({
    activeWorkspaceId: state.activeId,
    workspaces: state.workspaces,
  }),
}));

function makeClient() {
  return {
    from(table: string) {
      state.reads.push(table);
      const out: { data?: unknown; count?: number; error: null } =
        table === "customer_requests" && state.activeNeedCount >= 0 && state.tables.customer_requests === undefined
          ? { count: state.activeNeedCount, error: null }
          : (state.tables[table] ?? { data: [], error: null });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {};
      for (const m of ["select", "eq", "is", "in", "or", "order", "limit"]) b[m] = () => b;
      b.maybeSingle = async () => ({ data: Array.isArray(out.data) ? (out.data[0] ?? null) : (out.data ?? null), error: null });
      b.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve(out).then(ok, err);
      return b;
    },
    async rpc(fn: string) {
      state.rpcs.push(fn);
      return { data: null, error: null };
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  };
}

import { EMPLOYER_OPERATIONS_CAPABILITIES } from "./employer-operations-capabilities";
import type { CapabilityCaller } from "./contract";

const REQ = "11111111-1111-4111-8111-111111111111";
const USER = "00000000-0000-4000-8000-0000000000aa";
const TOKEN = "x".repeat(24);
const cap = (id: string) => {
  const c = EMPLOYER_OPERATIONS_CAPABILITIES.find((x) => x.id === id);
  if (!c) throw new Error(`missing ${id}`);
  return c;
};
const caller = (): CapabilityCaller =>
  ({ userId: USER, transport: "bearer", supabase: makeClient() as never, locale: "lt" }) as CapabilityCaller;

function scriptOrg(opts: { role?: string; creator?: string | null }) {
  state.tables = {
    organizations: {
      data: [{ id: "org-a", display_name: "Org A", legal_name: null, legacy_company_id: "comp-a" }],
      error: null,
    },
    companies: { data: [{ id: "comp-a", profile_id: opts.creator ?? "someone-else" }], error: null },
    company_memberships: { data: opts.role ? [{ role: opts.role }] : [], error: null },
  };
}

beforeEach(() => {
  state.workspaces = [{ kind: "organization", id: "org-a", name: "Org A" }];
  state.activeId = "org-a";
  state.reads = [];
  state.rpcs = [];
  state.billing = "stripe_live";
  state.activeNeedCount = 0;
  scriptOrg({});
});

describe("bearer + organization without membership/capability is DENIED (real gate chain)", () => {
  it.each(["demand.reopen_draft", "demand.reopen_confirm", "demand.close_confirm"])(
    "%s: no active membership row and not the creator -> refused, nothing written, no billing read",
    async (id) => {
      const input = id.endsWith("_draft") ? { requestId: REQ } : { requestId: REQ, confirmationToken: TOKEN };
      const r = await cap(id).run(caller(), input);
      expect(r.ok).toBe(false);
      expect(state.rpcs).toEqual([]);
      expect(state.reads).not.toContain("billing_subscriptions");
      expect(state.reads).not.toContain("customer_requests");
    },
  );

  it("a plain `member` role (no employer surface) is refused", async () => {
    scriptOrg({ role: "member" });
    const r = await cap("demand.reopen_confirm").run(caller(), { requestId: REQ, confirmationToken: TOKEN });
    expect(r.ok).toBe(false);
    expect(state.rpcs).toEqual([]);
    expect(state.reads).not.toContain("billing_subscriptions");
  });

  it("an organization absent from the membership-validated list is refused, even when its rows are readable", async () => {
    state.workspaces = [{ kind: "organization", id: "org-other", name: "Other" }];
    scriptOrg({ role: "owner" });
    const r = await cap("demand.reopen_confirm").run(caller(), { requestId: REQ, confirmationToken: TOKEN });
    expect(r.ok).toBe(false);
    expect(state.rpcs).toEqual([]);
    expect(state.reads).not.toContain("billing_subscriptions");
  });
});

describe("a caller-supplied organization id never creates authority", () => {
  it.each(["demand.reopen_draft", "demand.reopen_confirm", "demand.close_draft"])(
    "%s: an organizationId in the input is rejected by the strict schema",
    async (id) => {
      scriptOrg({ role: "owner", creator: USER });
      const base = id.endsWith("_draft") ? { requestId: REQ } : { requestId: REQ, confirmationToken: TOKEN };
      await expect(cap(id).run(caller(), { ...base, organizationId: "org-a" })).rejects.toThrow(/organizationId/);
      expect(state.rpcs).toEqual([]);
    },
  );
});

describe("billing / LMC is not bypassed", () => {
  it("a member of a FREE org at its cap is refused by the gate while billing is enforced", async () => {
    scriptOrg({ role: "owner", creator: USER });
    state.activeNeedCount = 1;
    const { gateOpenNeeds } = await import("@/lib/billing/open-needs-gate");
    const g = await gateOpenNeeds(makeClient() as never, "org-a", USER);
    expect(g.allowed).toBe(false);
    expect(state.rpcs).toEqual([]);
  });

  it("billing disabled: the gate stays permissive and unchanged", async () => {
    state.billing = "disabled";
    const { gateOpenNeeds } = await import("@/lib/billing/open-needs-gate");
    const g = await gateOpenNeeds(makeClient() as never, "org-a", USER);
    expect(g.allowed).toBe(true);
  });
});
