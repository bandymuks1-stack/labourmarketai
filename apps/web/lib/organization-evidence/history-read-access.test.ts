import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = {
  user: { id: "u1" } as { id: string } | null,
  roles: [] as string[],
  workspaceOpens: false,
  grants: [] as unknown[],
  rpcError: null as unknown,
};
const redirected: string[] = [];

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected.push(to);
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: async () => ({ data: state.grants, error: state.rpcError }),
  }),
}));
vi.mock("./evidence-store", () => ({ untypedClient: (c: unknown) => c }));
vi.mock("@/lib/auth/profile-roles", () => ({
  readActiveRoleRows: async () => state.roles.map((role) => ({ role })),
}));
vi.mock("@/lib/company/active-organization", () => ({ getWorkspaceContext: async () => ({}) }));
vi.mock("@/lib/company/organization-authority", () => ({
  workspaceOpensCompanySpace: () => state.workspaceOpens,
}));
vi.mock("@/lib/auth/require-role", () => ({
  requireRoleOrRedirect: async (locale: string, role: string) => {
    redirected.push(`/${locale}/dashboard?notice=needs_${role}_role`);
    throw new Error("REDIRECT");
  },
}));

import { hasLiveHistoryReadGrant, requireCompanyOrHistoryGrant } from "./history-read-access";

beforeEach(() => {
  state.user = { id: "u1" };
  state.roles = [];
  state.workspaceOpens = false;
  state.grants = [];
  state.rpcError = null;
  redirected.length = 0;
});

describe("requireCompanyOrHistoryGrant", () => {
  it("company role: full, as today", async () => {
    state.roles = ["company"];
    await expect(requireCompanyOrHistoryGrant("en")).resolves.toBe("full");
  });

  it("company workspace without the role: full, as today", async () => {
    state.workspaceOpens = true;
    await expect(requireCompanyOrHistoryGrant("en")).resolves.toBe("full");
  });

  it("a worker with a live grant: read-only grant mode", async () => {
    state.roles = ["worker"];
    state.grants = [{ organization_id: "o1" }];
    await expect(requireCompanyOrHistoryGrant("en")).resolves.toBe("grant");
    expect(redirected).toEqual([]);
  });

  it("a worker WITHOUT a grant: redirected exactly as today", async () => {
    state.roles = ["worker"];
    await expect(requireCompanyOrHistoryGrant("en")).rejects.toThrow("REDIRECT");
    expect(redirected).toEqual(["/en/dashboard?notice=needs_company_role"]);
  });

  it("a grant read that fails is no grant (fail closed)", async () => {
    state.grants = [{ organization_id: "o1" }];
    state.rpcError = { code: "PGRST202" };
    await expect(requireCompanyOrHistoryGrant("en")).rejects.toThrow("REDIRECT");
    await expect(hasLiveHistoryReadGrant()).resolves.toBe(false);
  });

  it("signed out: the login page", async () => {
    state.user = null;
    await expect(requireCompanyOrHistoryGrant("en")).rejects.toThrow("REDIRECT /en/auth/login");
  });
});
