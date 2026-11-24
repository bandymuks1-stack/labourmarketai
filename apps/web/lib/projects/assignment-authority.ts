/**
 * ASSIGN-FORM AUTHORITY (pure) — what the assign form OFFERS, derived from the
 * same three branches the database enforces in `assign_worker_to_project`
 * (migration 20261002142000). The RPC stays the only authority: this module
 * only decides what is worth OFFERING so the form never presents an action the
 * database will refuse. It widens nothing, and a success message is never
 * produced from it — only from the RPC result.
 *
 * The RPC's authorization, in words:
 *   A. can_manage_project AND (caller manages the worker by roster [owner/admin]
 *      OR a booking engagement links the worker to THIS project)
 *   B. the caller manages THIS project's organization AND the worker is an
 *      ACTIVE member of the roster of the company that OWNS this project
 *   C. platform admin
 */

export type RosterAssignScope =
  /** Owner/admin or platform admin: every roster worker the caller can read. */
  | "all-roster"
  /** Manager: only workers on the ACTIVE roster of the caller's OWN company,
   *  and only on projects of that company's organization (branch B). */
  | "own-company-roster"
  /** No roster authority at all (branch A/B both refused). */
  | "none";

export function rosterAssignScope(input: {
  /** The caller's role governs the organization (owner/admin). */
  readonly governs: boolean;
  readonly isPlatformAdmin: boolean;
  /** manage-projects AND manage-roster (a manager). */
  readonly canOperate: boolean;
  /** The active workspace resolved to a company the caller acts for. */
  readonly hasCompanyContext: boolean;
}): RosterAssignScope {
  // No company context: nothing to scope by; the database decides (unchanged).
  if (!input.hasCompanyContext) return "all-roster";
  if (input.governs || input.isPlatformAdmin) return "all-roster";
  if (input.canOperate) return "own-company-roster";
  return "none";
}

/**
 * Project ids for which ROSTER workers may be offered. `null` = no restriction
 * (the database still decides); an array = only these projects.
 */
export function rosterProjectIdsFor(
  scope: RosterAssignScope,
  projects: readonly { readonly id: string; readonly organizationId: string | null }[],
  ownOrganizationId: string | null,
): string[] | null {
  if (scope === "all-roster") return null;
  if (scope === "none" || !ownOrganizationId) return [];
  return projects.filter((p) => p.organizationId === ownOrganizationId).map((p) => p.id);
}

/** Does the form offer this roster worker on this project? */
export function offersRosterWorker(
  rosterProjectIds: readonly string[] | null,
  projectId: string,
): boolean {
  return rosterProjectIds === null || rosterProjectIds.includes(projectId);
}

/** Conceptual model of the RPC's three branches (for the agreement guard). */
export function rpcAuthorizes(w: {
  readonly canManageProject: boolean;
  readonly callerManagesWorkerByRoster: boolean;
  readonly hasEngagementForProject: boolean;
  readonly managesProjectOrganization: boolean;
  readonly projectHasOrganization: boolean;
  readonly workerOnProjectCompanyRoster: boolean;
  readonly isPlatformAdmin: boolean;
}): boolean {
  return (
    (w.canManageProject && (w.callerManagesWorkerByRoster || w.hasEngagementForProject)) ||
    (w.projectHasOrganization && w.managesProjectOrganization && w.workerOnProjectCompanyRoster) ||
    w.isPlatformAdmin
  );
}
