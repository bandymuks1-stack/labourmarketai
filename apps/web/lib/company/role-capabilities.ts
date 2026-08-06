/**
 * Organization role → capability matrix (M-P0-4 consumer slice, §11).
 *
 * ONE place that says what a governance role MAY DO — consumers ask for a
 * capability, never compare role strings. Doctrine (owner directive
 * 2026-08-06 §11 + COMPANY_MEMBERSHIPS_V1.md §2):
 *
 *   - owner and valid governance roles receive ONLY their authorized
 *     capabilities — a membership row is not a blanket grant;
 *   - `member` belongs (directory, leave) and governs NOTHING;
 *   - engagement-only workers never reach this matrix at all — an
 *     employment row is not a governance role and resolves no employer
 *     context (`employer-company-context.ts` fails closed first).
 *
 * DB-LAYER TRUTH (recorded, not hidden): every employer WRITE below this
 * matrix is still re-validated SQL-side, and today's RPC/RLS layer binds
 * writes to the company CREATOR (`companies.profile_id` /
 * `owns_company()`); the owner-gated `manages_organization` +
 * `save_company_setup_v3` widening ships separately and unapplied. The
 * matrix therefore narrows what the app OFFERS; it cannot and does not
 * widen what the database ACCEPTS.
 */

export type GovernanceRole =
  | "owner"
  | "admin"
  | "manager"
  | "external_manager"
  | "member";

export type OrganizationCapability =
  /** Company profile / settings / description / public business page. */
  | "manage-company-profile"
  /** Membership administration UI (the RPCs re-derive authority anyway). */
  | "administer-members"
  /** Roster operations: worker invites, operations roles, engagement
   *  provisioning, journal review toggles. */
  | "manage-roster"
  /** Project creation and project workspace administration. */
  | "manage-projects"
  /** Demand / shortlist / scouting employer surface. */
  | "manage-demand"
  /** See the member directory of the organization. */
  | "view-directory";

const ALL: readonly OrganizationCapability[] = [
  "manage-company-profile",
  "administer-members",
  "manage-roster",
  "manage-projects",
  "manage-demand",
  "view-directory",
];

const OPERATIONAL: readonly OrganizationCapability[] = [
  "manage-roster",
  "manage-projects",
  "manage-demand",
  "view-directory",
];

const CAPABILITIES: Record<GovernanceRole, ReadonlySet<OrganizationCapability>> = {
  owner: new Set(ALL),
  admin: new Set(ALL),
  // Managers are OPERATIONAL governance (0013 doctrine: roster, journal
  // review) — never company identity, never membership administration.
  manager: new Set(OPERATIONAL),
  external_manager: new Set(OPERATIONAL),
  member: new Set<OrganizationCapability>(["view-directory"]),
};

export function hasOrganizationCapability(
  role: GovernanceRole,
  capability: OrganizationCapability,
): boolean {
  return CAPABILITIES[role].has(capability);
}

export function isGovernanceRole(value: string | null | undefined): value is GovernanceRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "manager" ||
    value === "external_manager" ||
    value === "member"
  );
}

/** Roles that resolve an EMPLOYER surface at all (member does not). */
export function isEmployerSurfaceRole(role: GovernanceRole): boolean {
  return role !== "member";
}
