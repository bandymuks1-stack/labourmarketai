import {
  hasOrganizationCapability,
  isGovernanceRole,
  type GovernanceRole,
} from "@/lib/company/role-capabilities";
import {
  PERSONAL_WORKSPACE_ID,
  type WorkspaceInfo,
} from "@/lib/company/organization-switch";

/**
 * ORGANIZATION AUTHORITY — READ split from EDIT (capability matrix P1
 * "Governance members / manager role", 2026-09-23).
 *
 * ONE pure projection of "what may this person do in THIS organization",
 * derived from the membership truth the workspace resolver already carries
 * (`company_memberships.role`, the owned-organization row, the legacy
 * engagement-manager arm). Pure: no IO, no client, unit-tested per role.
 *
 * Three questions that used to be answered by one filter:
 *
 *   canOpen     READ authority — open the workspace, its doors and pages,
 *               the member directory. ANY active governance membership
 *               (owner / admin / manager / external_manager / member) or the
 *               company creator. `getOwnedCompanyById` admitted only the
 *               creator and owner/admin members, so a MANAGER was told
 *               "create a company" on every door of the organization they
 *               belong to.
 *   canGovern   EDIT authority over identity and membership — owner / admin
 *               (or the creator). Every write path keeps this; SQL re-checks
 *               it (`owns_company`, `save_company_setup_v3`).
 *   canOperate  OPERATIONAL authority per the role → capability matrix
 *               (`role-capabilities.ts`): roster, projects, demand.
 *
 * `sqlWritesGranted` records what the DATABASE accepts for EXACTLY these
 * operations: projects select / insert / update and the roster read
 * (company_workers select) — the creator or an active owner/admin membership
 * (`owns_company`) AND, since 20260924140000_manager_projects_roster_rls_v1,
 * every role the matrix lets operate (`manages_organization`: manager,
 * external_manager). It says NOTHING about roster MANAGEMENT: reading pending
 * worker invitations, inviting, provisioning and per-worker role changes stay
 * owner/admin-only in SQL (`owns_company`), and those surfaces carry their own
 * owner/admin gate or named refusal. Project DELETE stays owner/admin (no
 * `authenticated` DELETE grant). When a future role operates in the matrix
 * before SQL admits these operations, the app must SAY so
 * (`operationalWritesNeedGrant`) instead of rendering a generic error or an
 * empty list (SEP-7: refused ≠ empty).
 *
 * `canManageInvitations` is the `manage-invitations` capability: owner/admin
 * (and the creator), never a job title (owner direction 2026-09-24). It
 * gates the invite form and the pending-invitations list; a person without
 * it reads a neutral explanation instead of an empty list.
 *
 * An ARCHIVED organization (owner decisions 2026-09-23 / 2026-09-24) is not
 * an OPERATING workspace: no workspace list offers it, so this projection is
 * never asked for it and `archived: true` answers no operating authority.
 * Archiving is not deletion and not loss of history: the database helpers do
 * not consult `archived_at`, so the owner and every person entitled to a
 * record keep reading it exactly as before.
 */

/** Roles whose ACTIVE membership OPENS the organization (read). */
export const ROLES_THAT_OPEN: readonly GovernanceRole[] = [
  "owner",
  "admin",
  "manager",
  "external_manager",
  "member",
];

/** Roles whose ACTIVE membership GOVERNS the organization (edit identity,
 *  administer members, billing). The SQL `owns_company` arm is this set. */
export const ROLES_THAT_GOVERN: readonly GovernanceRole[] = ["owner", "admin"];

/** Which membership set a company-by-id read admits. */
export type CompanyReadAccess = "govern" | "open";

export function rolesForAccess(access: CompanyReadAccess): readonly GovernanceRole[] {
  return access === "govern" ? ROLES_THAT_GOVERN : ROLES_THAT_OPEN;
}

export interface OrganizationAuthority {
  /** The resolved governance role, or null when the person holds none. */
  readonly role: GovernanceRole | null;
  /** May open the workspace and read its doors. */
  readonly canOpen: boolean;
  /** May edit identity / administer members / billing. */
  readonly canGovern: boolean;
  /** May run operations (roster, projects, demand) per the matrix. */
  readonly canOperate: boolean;
  /** Projects select/insert/update + roster read only: `owns_company`
   *  (creator, owner/admin) or `manages_organization` (the operating roles).
   *  Roster management (invitations, provisioning, role changes) is not
   *  covered — it stays owner/admin in SQL. */
  readonly sqlWritesGranted: boolean;
  /** May invite people into the organization and see its pending
   *  invitations (`manage-invitations`): owner/admin, never a job title. */
  readonly canManageInvitations: boolean;
}

export const NO_AUTHORITY: OrganizationAuthority = {
  role: null,
  canOpen: false,
  canGovern: false,
  canOperate: false,
  sqlWritesGranted: false,
  canManageInvitations: false,
};

/**
 * THE projection. `role` is the caller's own active `company_memberships`
 * row (any string is accepted and validated here — an unknown value grants
 * nothing); `isCreator` is the `companies.profile_id` compatibility arm and
 * resolves as owner when no membership row names a role.
 */
export function projectOrganizationAuthority(input: {
  readonly role?: string | null;
  readonly isCreator?: boolean;
  readonly archived?: boolean;
}): OrganizationAuthority {
  if (input.archived) return NO_AUTHORITY;
  const role: GovernanceRole | null = isGovernanceRole(input.role)
    ? input.role
    : input.isCreator
      ? "owner"
      : null;
  if (role === null) return NO_AUTHORITY;
  const governs = ROLES_THAT_GOVERN.includes(role) || input.isCreator === true;
  const canOperate =
    hasOrganizationCapability(role, "manage-projects") &&
    hasOrganizationCapability(role, "manage-roster");
  return {
    role,
    canOpen: ROLES_THAT_OPEN.includes(role),
    canGovern: governs,
    canOperate,
    sqlWritesGranted: governs || canOperate,
    // The creator arm is owner-equivalent here too (`owns_company` admits it).
    canManageInvitations:
      hasOrganizationCapability(role, "manage-invitations") || input.isCreator === true,
  };
}

/** True when the matrix lets the role operate but the database still refuses
 *  the write (the manager gap) — the surfaces render the honest refused
 *  state naming the owner/admin grant, never a generic error. */
export function operationalWritesNeedGrant(authority: OrganizationAuthority): boolean {
  return authority.canOperate && !authority.sqlWritesGranted;
}

/**
 * Authority from ONE row of the membership-validated workspace list — the
 * same list the chip renders (`readWorkspaceMemberships`). A governance row
 * carries its role; an OWNED organization row carries `relationship: owner`;
 * a legacy engagement-manager row carries `relationship: manager` (the
 * `manages_organization` dual arm accepts it). Employee / other rows are not
 * governance and open nothing.
 *
 * THE ORGANIZATION'S TYPE IS NOT CONSULTED — by contract, not by omission
 * (review P2 on #1859, 2026-09-24). An owned row opens the company space
 * whether its `organizationType` is `company`, `agency`, `team` or `other`:
 * an agency is a company TYPE (`companies.company_type = 'staffing_agency'`,
 * migration 20260612090000), and the doors, `actingRoleForWorkspace` and the
 * dispatcher's held roles already fold an agency organization into the same
 * governs vocabulary. So an agency-only owner standing in their agency is an
 * employer here and `/dashboard/company/*` opens for them. Before #1859 the
 * role gate refused that person with `?notice=needs_company_role` because
 * they held no `profile_roles.company` row — a gap in the gate, never a
 * contract, and no contract document lists it. The NEGATIVE control stays
 * the relationship, not the type: a worker whose only row in an agency (or
 * any organization) is an employee engagement opens nothing.
 */
export function authorityForWorkspace(
  workspace:
    | Pick<WorkspaceInfo, "kind" | "relationship" | "governanceRole">
    | null
    | undefined,
): OrganizationAuthority {
  if (!workspace || workspace.kind !== "organization") return NO_AUTHORITY;
  if (isGovernanceRole(workspace.governanceRole)) {
    return projectOrganizationAuthority({ role: workspace.governanceRole });
  }
  if (workspace.relationship === "owner") {
    return projectOrganizationAuthority({ role: "owner" });
  }
  if (workspace.relationship === "manager") {
    return projectOrganizationAuthority({ role: "manager" });
  }
  return NO_AUTHORITY;
}

/** The shape every workspace resolution exposes (`WorkspaceContext`), typed
 *  structurally so this module stays pure and server-free. */
export interface ActiveWorkspaceLike {
  readonly workspaces: readonly WorkspaceInfo[];
  readonly activeWorkspaceId: string;
}

/**
 * Authority in the ACTIVE workspace. The active id must be an organization
 * in the caller's OWN validated list — a member of ANOTHER organization, a
 * stale pointer, or the personal workspace all resolve to no organization.
 */
export function activeOrganizationAuthority(ctx: ActiveWorkspaceLike): {
  readonly organizationId: string | null;
  readonly authority: OrganizationAuthority;
} {
  if (ctx.activeWorkspaceId === PERSONAL_WORKSPACE_ID) {
    return { organizationId: null, authority: NO_AUTHORITY };
  }
  const active = ctx.workspaces.find(
    (w) => w.kind === "organization" && w.id === ctx.activeWorkspaceId,
  );
  if (!active) return { organizationId: null, authority: NO_AUTHORITY };
  return { organizationId: active.id, authority: authorityForWorkspace(active) };
}

/**
 * THE company gate's membership arm. A person whose ACTIVE workspace is an
 * organization they hold an active governance membership in (or own) may
 * enter the employer space — the `company` participation role is one door
 * in, membership in the workspace is the other. `membership_accept_v1`
 * never grants `profile_roles`, and nothing here writes it either: the gate
 * is DERIVED from the workspace the person is standing in.
 */
export function workspaceOpensCompanySpace(ctx: ActiveWorkspaceLike): boolean {
  return activeOrganizationAuthority(ctx).authority.canOpen;
}
