/**
 * Operations role assignment — pure validation (slice ops-role-assign-rpc-v1).
 *
 * Mirrors the server-side SECURITY DEFINER RPCs assign_company_worker_role /
 * assign_agency_worker_role (supabase/migrations/0031) so the server action
 * can fail fast with the SAME rules the database enforces. The RPC remains
 * the real security boundary (ownership re-validation, row existence); this
 * module is a pure, deterministic pre-check — no IO, no AI, no network.
 *
 * Honest-by-design:
 *   - Only the conservative migration-0030 role set is assignable.
 *   - A NULL/blank role clears the assignment (role + title) safely.
 *   - journal_review_enabled can NEVER be turned on here: the employment↔
 *     journal engagement-context bridge does not exist yet, so review rights
 *     can never come from a stored label. Requesting review-enable is
 *     rejected ("review_not_allowed"), never silently honoured.
 *   - foreman / project_manager are STORABLE labels but grant nothing — the
 *     role-capabilities map keeps them not_enabled, so storing the label
 *     creates no active coordination/review state.
 */

/** The exact roles a relationship may store (migration 0030 CHECK set). */
export const ASSIGNABLE_OPERATIONS_ROLES = [
  "worker",
  "foreman",
  "project_manager",
  "company_admin",
  "agency_admin",
] as const;

export type AssignableOperationsRole =
  (typeof ASSIGNABLE_OPERATIONS_ROLES)[number];

export interface AssignOperationsRoleInput {
  /** Desired operations_role; NULL/blank means "clear the assignment". */
  readonly operationsRole?: string | null;
  /** Optional free-text title; trimmed, blank becomes NULL. */
  readonly operationsTitle?: string | null;
  /** Attempt to enable journal review — always rejected in this slice. */
  readonly journalReviewEnabled?: boolean | null;
}

export type AssignOperationsRoleValidation =
  | {
      readonly ok: true;
      readonly action: "assign";
      readonly role: AssignableOperationsRole;
      readonly title: string | null;
      /** Always false — review is never enabled by an assignment. */
      readonly journalReviewEnabled: false;
    }
  | {
      readonly ok: true;
      readonly action: "clear";
      readonly role: null;
      readonly title: null;
      readonly journalReviewEnabled: false;
    }
  | {
      readonly ok: false;
      readonly reason: "invalid_role" | "review_not_allowed";
    };

export function isAssignableOperationsRole(
  value: string,
): value is AssignableOperationsRole {
  return (ASSIGNABLE_OPERATIONS_ROLES as readonly string[]).includes(value);
}

/** The text outcomes the assignment RPC / server actions can return. */
export type AssignRoleOutcome =
  | "assigned"
  | "cleared"
  | "not_owner"
  | "not_linked"
  | "invalid_role"
  | "review_not_allowed";

/** Shared server-action state for the owner role-select form (company OR
 *  agency). `no_org` = the caller has no owned company/agency. */
export type AssignRoleActionState =
  | { ok: true; outcome: AssignRoleOutcome }
  | {
      ok: false;
      code: "no_org" | "needs_migration" | "error";
      message?: string;
    };

/**
 * Validate a desired operations-role assignment. Returns a discriminated
 * result the caller maps to an RPC argument set (or an early rejection). The
 * server RPC re-checks everything that matters for security; this is the
 * fail-fast, UI-friendly mirror of its rules.
 */
export function validateOperationsRoleAssignment(
  input: AssignOperationsRoleInput,
): AssignOperationsRoleValidation {
  // Checked first so a role label can never be paired with a review grant.
  if (input.journalReviewEnabled === true) {
    return { ok: false, reason: "review_not_allowed" };
  }

  const role = (input.operationsRole ?? "").trim();
  const title = (input.operationsTitle ?? "").trim();

  // Clearing: a blank role wipes both role and title.
  if (role === "") {
    return {
      ok: true,
      action: "clear",
      role: null,
      title: null,
      journalReviewEnabled: false,
    };
  }

  if (!isAssignableOperationsRole(role)) {
    return { ok: false, reason: "invalid_role" };
  }

  return {
    ok: true,
    action: "assign",
    role,
    title: title === "" ? null : title,
    journalReviewEnabled: false,
  };
}
