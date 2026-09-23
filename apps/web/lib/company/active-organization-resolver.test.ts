import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE ONE WORKSPACE RESOLVER — BEHAVIOUR (owner program 2026-09-23).
 *
 * Runs the REAL `getWorkspaceContext`, `getActiveOrganizationContext` and
 * `resolveActiveWorkspaceForCaller` over stubbed canonical reads, and pins what
 * made the chip, the pins, the starters, the company pages and the dispatcher
 * name DIFFERENT organizations in one request:
 *
 *   - one pointer rule (d2): an organization in the DB pointer wins, the
 *     session cookie decides only when the DB pointer is null;
 *   - the identity that decides the single-org default is read from the
 *     session profile INSIDE the resolver — callers pass nothing;
 *   - `getActiveOrganizationContext` is a projection of it, so a member (not
 *     owner) pointer names the member organization;
 *   - the cookie is bound to the user;
 *   - the engagement list asks only for relationships a switch can reach.
 */

const USER = "33333333-3333-4333-8333-333333333333";
const OTHER_USER = "44444444-4444-4444-8444-444444444444";
const OWNED = "11111111-1111-4111-8111-111111111111";
const MANAGED = "22222222-2222-4222-8222-222222222222";

const state = {
  dbPointer: null as string | null,
  cookie: undefined as string | undefined,
  activeRole: "company" as string | null,
  owned: [OWNED] as string[],
  engagement: [] as { organization_id: string; relationship_slug: string }[],
  engagementIn: [] as unknown[],
};

function builder(table: string) {
  const answer = () => {
    if (table === "profiles") {
      return { data: { active_organization_id: state.dbPointer }, error: null };
    }
    if (table === "engagement_contexts") {
      return {
        data: state.engagement.map((e) => ({
          ...e,
          organizations: { display_name: `Org ${e.organization_id.slice(0, 4)}`, organization_type: "company" },
        })),
        error: null,
      };
    }
    return { data: [], error: null }; // company_memberships: none
  };
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "order"]) chain[m] = () => chain;
  chain.in = (_col: string, values: unknown[]) => {
    if (table === "engagement_contexts") state.engagementIn = values;
    return chain;
  };
  chain.limit = async () => answer();
  chain.maybeSingle = async () => answer();
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from: (t: string) => builder(t),
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (state.cookie === undefined ? undefined : { value: state.cookie }),
  }),
}));
vi.mock("@/lib/auth/session-profile", () => ({
  getSessionProfile: async () => ({
    user: { id: USER },
    profile: { id: USER, active_role: state.activeRole },
    profileRead: "ok",
  }),
}));
vi.mock("@/lib/company/owned-organizations", () => {
  const ownedRead = async () => ({
    kind: "ok",
    organizations: state.owned.map((id) => ({
      id,
      name: "Owned Co",
      organizationType: "company",
      legacyCompanyId: "c0000000-0000-4000-8000-000000000000",
      companyType: null,
    })),
  });
  return { getOwnedOrganizations: ownedRead, readOwnedOrganizations: ownedRead };
});
// React's request cache would return the FIRST scenario's answer for every
// later test outside a request.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: <T,>(fn: T) => fn };
});

const {
  getWorkspaceContext,
  getActiveOrganizationContext,
  governedActiveOrganizationId,
  resolveActiveWorkspaceForCaller,
} = await import("./active-organization");
const { encodeWorkspacePointerCookie, PERSONAL_WORKSPACE_ID } = await import("./organization-switch");

beforeEach(() => {
  state.dbPointer = null;
  state.cookie = undefined;
  state.activeRole = "company";
  state.owned = [OWNED];
  state.engagement = [];
  state.engagementIn = [];
});

describe("getWorkspaceContext — one pointer rule, one identity", () => {
  it("takes no identity argument (the request cache can no longer split per caller)", () => {
    expect(getWorkspaceContext.length).toBe(0);
  });

  it("d2: an organization in the DB pointer wins over a disagreeing cookie", async () => {
    state.engagement = [{ organization_id: MANAGED, relationship_slug: "manager" }];
    state.dbPointer = MANAGED;
    state.cookie = encodeWorkspacePointerCookie(USER, OWNED);
    expect((await getWorkspaceContext()).activeWorkspaceId).toBe(MANAGED);
  });

  it("d2: the cookie decides when the DB pointer is null (D-20 explicit personal)", async () => {
    state.cookie = encodeWorkspacePointerCookie(USER, PERSONAL_WORKSPACE_ID);
    // company identity + ONE org would otherwise default to it.
    expect((await getWorkspaceContext()).activeWorkspaceId).toBe(PERSONAL_WORKSPACE_ID);
  });

  it("the identity default comes from the session profile", async () => {
    state.activeRole = "company";
    expect((await getWorkspaceContext()).activeWorkspaceId).toBe(OWNED);
    state.activeRole = "worker";
    expect((await getWorkspaceContext()).activeWorkspaceId).toBe(PERSONAL_WORKSPACE_ID);
  });

  it("a cookie written for ANOTHER user is ignored", async () => {
    state.cookie = encodeWorkspacePointerCookie(OTHER_USER, PERSONAL_WORKSPACE_ID);
    // Their explicit personal choice must not overrule this user's default.
    expect((await getWorkspaceContext()).activeWorkspaceId).toBe(OWNED);
  });

  it("asks the engagement source only for relationships a switch can reach", async () => {
    await getWorkspaceContext();
    expect(state.engagementIn).toEqual(["owner", "manager", "external_manager", "employee", "viewer"]);
    expect(state.engagementIn).not.toContain("student");
  });

  it("carries the company binding of every organization row", async () => {
    const ctx = await getWorkspaceContext();
    expect(ctx.workspaces.find((w) => w.id === OWNED)).toMatchObject({
      companyBound: true,
      relationship: "owner",
    });
  });
});

describe("getActiveOrganizationContext is a projection — it names what the chip names", () => {
  it("a MEMBER pointer names the member organization (the W9 wrong-org case)", async () => {
    state.engagement = [{ organization_id: MANAGED, relationship_slug: "manager" }];
    state.dbPointer = MANAGED;
    const ctx = await getActiveOrganizationContext();
    // The owned-only reader fell through this pointer to the single owned org.
    expect(ctx.activeOrganizationId).toBe(MANAGED);
    expect(ctx.activeOrganizationId).toBe((await getWorkspaceContext()).activeWorkspaceId);
    // The owned list survives for the legacy-company lookups.
    expect(ctx.organizations.map((o) => o.id)).toEqual([OWNED]);
  });

  it("the personal workspace → no active organization", async () => {
    state.cookie = encodeWorkspacePointerCookie(USER, PERSONAL_WORKSPACE_ID);
    expect((await getActiveOrganizationContext()).activeOrganizationId).toBeNull();
  });
});

describe("governedActiveOrganizationId — the company pages' capability fallback", () => {
  it("an EMPLOYEE-only active workspace yields no capability organization", async () => {
    state.engagement = [{ organization_id: MANAGED, relationship_slug: "employee" }];
    state.dbPointer = MANAGED;
    const ctx = await getActiveOrganizationContext();
    // The projection still names what the chip names…
    expect(ctx.activeOrganizationId).toBe(MANAGED);
    expect(ctx.activeOrganization?.relationship).toBe("employee");
    // …but no owner capability UI is offered for it.
    expect(governedActiveOrganizationId(ctx)).toBeNull();
  });

  it("NEGATIVE CONTROL: a MANAGER or OWNER active workspace is the fallback", async () => {
    state.engagement = [{ organization_id: MANAGED, relationship_slug: "manager" }];
    state.dbPointer = MANAGED;
    expect(governedActiveOrganizationId(await getActiveOrganizationContext())).toBe(MANAGED);
    state.dbPointer = OWNED;
    expect(governedActiveOrganizationId(await getActiveOrganizationContext())).toBe(OWNED);
  });

  it("the personal workspace yields none", async () => {
    state.cookie = encodeWorkspacePointerCookie(USER, PERSONAL_WORKSPACE_ID);
    expect(governedActiveOrganizationId(await getActiveOrganizationContext())).toBeNull();
  });

  it("every company page uses the governed fallback, never the raw active id", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const base = join(__dirname, "..", "..", "app", "[locale]", "dashboard", "company");
    for (const rel of ["page.tsx", "education/page.tsx", "needs/page.tsx", "people/page.tsx", "settings/page.tsx"]) {
      const src = readFileSync(join(base, rel), "utf8");
      expect(src, rel).toMatch(/governedActiveOrganizationId\(orgContext\)/);
      expect(src, rel).not.toMatch(/orgContext\.activeOrganizationId/);
    }
  });
});

describe("resolveActiveWorkspaceForCaller — the bearer path shares the rule", () => {
  const caller = async () => {
    const { createClient } = await import("@/lib/supabase/server");
    return { supabase: (await createClient()) as never, userId: USER };
  };

  it("a bearer caller (no session pointer) resolves the DB pointer", async () => {
    state.engagement = [{ organization_id: MANAGED, relationship_slug: "employee" }];
    state.dbPointer = MANAGED;
    const ctx = await resolveActiveWorkspaceForCaller(await caller(), null);
    expect(ctx.activeWorkspaceId).toBe(MANAGED);
  });

  it("a cookie transport's caller applies its session pointer under the same rule", async () => {
    const ctx = await resolveActiveWorkspaceForCaller(
      { ...(await caller()), sessionWorkspacePointer: PERSONAL_WORKSPACE_ID },
      "company",
    );
    expect(ctx.activeWorkspaceId).toBe(PERSONAL_WORKSPACE_ID);
    // Without it, the same caller gets the single-org default.
    expect((await resolveActiveWorkspaceForCaller(await caller(), "company")).activeWorkspaceId).toBe(OWNED);
  });
});
