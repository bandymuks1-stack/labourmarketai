import { describe, expect, it } from "vitest";

import {
  NO_AUTHORITY,
  ROLES_THAT_GOVERN,
  ROLES_THAT_OPEN,
  activeOrganizationAuthority,
  authorityForWorkspace,
  operationalWritesNeedGrant,
  projectOrganizationAuthority,
  rolesForAccess,
  workspaceOpensCompanySpace,
} from "./organization-authority";
import { PERSONAL_WORKSPACE_ID, type WorkspaceInfo } from "./organization-switch";

/**
 * READ authority split from EDIT authority — the pure projection, per role.
 *
 * The defect: `getOwnedCompanyById` admitted the creator and owner/admin
 * members only, so a MANAGER of the canonical organization was told "create
 * a company" on every door. The projection below is what the doors, the
 * pages, the role gate and the dispatcher now derive from.
 */

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function org(
  id: string,
  extra: Partial<Pick<WorkspaceInfo, "relationship" | "governanceRole">> = {},
): WorkspaceInfo {
  return { id, name: `Org ${id.slice(0, 4)}`, kind: "organization", accentIndex: 0, ...extra };
}
const PERSONAL: WorkspaceInfo = { id: PERSONAL_WORKSPACE_ID, name: "", kind: "personal", accentIndex: 0 };

describe("projectOrganizationAuthority — one answer per role", () => {
  it("owner: opens, governs, operates, and the database accepts the writes", () => {
    expect(projectOrganizationAuthority({ role: "owner" })).toEqual({
      role: "owner",
      canOpen: true,
      canGovern: true,
      canOperate: true,
      sqlWritesGranted: true,
    });
  });

  it("admin: same as owner", () => {
    expect(projectOrganizationAuthority({ role: "admin" })).toMatchObject({
      canOpen: true,
      canGovern: true,
      canOperate: true,
      sqlWritesGranted: true,
    });
  });

  it("manager: OPENS and OPERATES, never governs — and the database has not caught up", () => {
    const a = projectOrganizationAuthority({ role: "manager" });
    expect(a).toEqual({
      role: "manager",
      canOpen: true,
      canGovern: false,
      canOperate: true,
      sqlWritesGranted: false,
    });
    // The manager gap the surfaces must SAY (refused ≠ empty).
    expect(operationalWritesNeedGrant(a)).toBe(true);
  });

  it("external_manager: the same operational shape as manager", () => {
    expect(projectOrganizationAuthority({ role: "external_manager" })).toMatchObject({
      canOpen: true,
      canGovern: false,
      canOperate: true,
      sqlWritesGranted: false,
    });
  });

  it("member: opens (directory, leave) and nothing else", () => {
    const a = projectOrganizationAuthority({ role: "member" });
    expect(a).toEqual({
      role: "member",
      canOpen: true,
      canGovern: false,
      canOperate: false,
      sqlWritesGranted: false,
    });
    // Nothing to grant: the matrix does not let a member operate either.
    expect(operationalWritesNeedGrant(a)).toBe(false);
  });

  it("no role: nothing — and an unknown role string is NOT a role", () => {
    expect(projectOrganizationAuthority({ role: null })).toEqual(NO_AUTHORITY);
    expect(projectOrganizationAuthority({})).toEqual(NO_AUTHORITY);
    expect(projectOrganizationAuthority({ role: "superuser" })).toEqual(NO_AUTHORITY);
    expect(projectOrganizationAuthority({ role: "employee" })).toEqual(NO_AUTHORITY);
  });

  it("the creator resolves as owner when no membership row names a role", () => {
    expect(projectOrganizationAuthority({ isCreator: true })).toMatchObject({
      role: "owner",
      canGovern: true,
      sqlWritesGranted: true,
    });
    // A creator who ALSO holds a manager row keeps governing (the creator
    // arm is owner-equivalent, exactly as the employer resolver treats it).
    expect(projectOrganizationAuthority({ role: "manager", isCreator: true })).toMatchObject({
      role: "manager",
      canGovern: true,
      sqlWritesGranted: true,
    });
  });

  it("an ARCHIVED organization grants nothing to anyone, owner included", () => {
    for (const role of ["owner", "admin", "manager", "member"]) {
      expect(projectOrganizationAuthority({ role, archived: true }), role).toEqual(NO_AUTHORITY);
    }
    expect(projectOrganizationAuthority({ isCreator: true, archived: true })).toEqual(NO_AUTHORITY);
  });

  it("owner and admin never need a grant", () => {
    for (const role of ROLES_THAT_GOVERN) {
      expect(operationalWritesNeedGrant(projectOrganizationAuthority({ role })), role).toBe(false);
    }
  });
});

describe("the role sets the by-id company read filters on", () => {
  it("govern = owner/admin (what owns_company accepts); open = every governance role", () => {
    expect([...rolesForAccess("govern")]).toEqual(["owner", "admin"]);
    expect([...rolesForAccess("open")]).toEqual([
      "owner",
      "admin",
      "manager",
      "external_manager",
      "member",
    ]);
    expect(ROLES_THAT_OPEN).toEqual(expect.arrayContaining([...ROLES_THAT_GOVERN]));
  });
});

describe("authorityForWorkspace — from the chip's own membership list", () => {
  it("a governance row carries its role", () => {
    expect(authorityForWorkspace(org(ORG_A, { governanceRole: "manager" })).role).toBe("manager");
    expect(authorityForWorkspace(org(ORG_A, { governanceRole: "member" })).canOpen).toBe(true);
    expect(authorityForWorkspace(org(ORG_A, { governanceRole: "member" })).canOperate).toBe(false);
  });

  it("an OWNED organization row is owner authority", () => {
    expect(authorityForWorkspace(org(ORG_A, { relationship: "owner" }))).toMatchObject({
      role: "owner",
      canGovern: true,
    });
  });

  it("a legacy engagement-manager row opens and operates (the manages_organization dual arm)", () => {
    expect(authorityForWorkspace(org(ORG_A, { relationship: "manager" }))).toMatchObject({
      role: "manager",
      canOpen: true,
      canGovern: false,
    });
  });

  it("an employee-only or unrelated row opens NOTHING (employment is not governance)", () => {
    expect(authorityForWorkspace(org(ORG_A, { relationship: "employee" }))).toEqual(NO_AUTHORITY);
    expect(authorityForWorkspace(org(ORG_A, { relationship: "other" }))).toEqual(NO_AUTHORITY);
    expect(authorityForWorkspace(org(ORG_A))).toEqual(NO_AUTHORITY);
    expect(authorityForWorkspace(PERSONAL)).toEqual(NO_AUTHORITY);
    expect(authorityForWorkspace(null)).toEqual(NO_AUTHORITY);
  });

  it("the governance role wins over a folded relationship label", () => {
    // `relationship` folds admin into "manager"; the row's own role decides.
    expect(
      authorityForWorkspace(org(ORG_A, { relationship: "manager", governanceRole: "admin" })).canGovern,
    ).toBe(true);
  });
});

describe("the company gate's membership arm — ACTIVE workspace only", () => {
  it("a manager standing in their organization opens the company space", () => {
    const ctx = {
      workspaces: [PERSONAL, org(ORG_A, { governanceRole: "manager" })],
      activeWorkspaceId: ORG_A,
    };
    expect(workspaceOpensCompanySpace(ctx)).toBe(true);
    expect(activeOrganizationAuthority(ctx)).toMatchObject({
      organizationId: ORG_A,
      authority: { role: "manager", canOpen: true },
    });
  });

  it("NEGATIVE: a member of ANOTHER organization does not open this one", () => {
    // The person holds a manager membership in A; the active pointer names
    // B, which is not in their list at all (a stale or foreign pointer).
    const ctx = {
      workspaces: [PERSONAL, org(ORG_A, { governanceRole: "manager" })],
      activeWorkspaceId: ORG_B,
    };
    expect(workspaceOpensCompanySpace(ctx)).toBe(false);
    expect(activeOrganizationAuthority(ctx)).toEqual({ organizationId: null, authority: NO_AUTHORITY });
  });

  it("NEGATIVE: membership elsewhere does not carry into an employee-only workspace", () => {
    // Manager of A, employee of B, standing in B: B opens nothing.
    const ctx = {
      workspaces: [
        PERSONAL,
        org(ORG_A, { governanceRole: "manager" }),
        org(ORG_B, { relationship: "employee" }),
      ],
      activeWorkspaceId: ORG_B,
    };
    expect(workspaceOpensCompanySpace(ctx)).toBe(false);
  });

  it("NEGATIVE: the personal workspace never opens the company space", () => {
    const ctx = {
      workspaces: [PERSONAL, org(ORG_A, { governanceRole: "owner" })],
      activeWorkspaceId: PERSONAL_WORKSPACE_ID,
    };
    expect(workspaceOpensCompanySpace(ctx)).toBe(false);
  });

  it("an empty list (failed or absent membership read) opens nothing", () => {
    expect(workspaceOpensCompanySpace({ workspaces: [], activeWorkspaceId: ORG_A })).toBe(false);
  });
});
