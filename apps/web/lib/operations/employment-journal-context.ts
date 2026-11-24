import {
  isOperationsRoleEnabled,
  type OperationsRoleId,
} from "./role-capabilities";

/**
 * Employment ↔ work-journal operational context — pure, deterministic
 * (long-cycle plan PR B). Turns the additive bridge fields (migration
 * 0030: operations_role + journal_review_enabled on company_workers /
 * agency_workers) into one honest operational verdict.
 *
 * Conservative by design:
 *   - Missing fields → NOT enabled.
 *   - A stored operations_role label NEVER grants a capability on its
 *     own — it is gated by the operations role-capability map, so a
 *     relationship tagged "foreman" / "project_manager" stays
 *     not_enabled until those roles are truly enabled platform-wide.
 *   - Review is granted only when journal_review_enabled is true AND the
 *     mapped role is an enabled reviewer role.
 *   - No AI, no external calls, no fake approvals.
 */

export type RelationshipType = "company" | "agency" | "none";

/** Reviewer roles that COULD review when review is enabled + role active. */
const REVIEWER_ROLES: ReadonlySet<OperationsRoleId> = new Set([
  "company_admin",
  "agency_admin",
]);

const KNOWN_ROLES: ReadonlySet<string> = new Set([
  "worker",
  "foreman",
  "project_manager",
  "company_admin",
  "agency_admin",
]);

export type ReviewCapability = "can_review" | "can_view" | "not_enabled";
export type CoordinationStatus = "active" | "partial" | "not_enabled";

export interface EmploymentJournalInput {
  /** "company" / "agency" if a real link row exists, else null. */
  readonly relationship: "company" | "agency" | null | undefined;
  /** Raw operations_role column value (bridge migration 0030), or null. */
  readonly operationsRole: string | null | undefined;
  /** Raw journal_review_enabled column (default false), or undefined. */
  readonly journalReviewEnabled: boolean | null | undefined;
}

export interface EmploymentJournalContext {
  readonly relationshipType: RelationshipType;
  /** Normalised operations role, or "not_enabled" when unset/unknown. */
  readonly operationsRole: OperationsRoleId | "not_enabled";
  /** Whether that role is enabled in the operations capability map. */
  readonly roleEnabled: boolean;
  readonly journalReviewEnabled: boolean;
  readonly reviewCapability: ReviewCapability;
  readonly coordinationStatus: CoordinationStatus;
  /** Stable key the UI maps to localized copy. */
  readonly safeUiMessageKey: string;
  /** Stable key for the single next action. */
  readonly nextAction: string;
}

export function computeEmploymentJournalContext(
  input: EmploymentJournalInput,
): EmploymentJournalContext {
  const relationshipType: RelationshipType =
    input.relationship === "company"
      ? "company"
      : input.relationship === "agency"
        ? "agency"
        : "none";

  const rawRole = (input.operationsRole ?? "").trim();
  const operationsRole: OperationsRoleId | "not_enabled" = KNOWN_ROLES.has(
    rawRole,
  )
    ? (rawRole as OperationsRoleId)
    : "not_enabled";
  const roleEnabled =
    operationsRole !== "not_enabled" && isOperationsRoleEnabled(operationsRole);
  const journalReviewEnabled = input.journalReviewEnabled === true;

  // No relationship at all → nothing is enabled.
  if (relationshipType === "none") {
    return {
      relationshipType,
      operationsRole: "not_enabled",
      roleEnabled: false,
      journalReviewEnabled,
      reviewCapability: "not_enabled",
      coordinationStatus: "not_enabled",
      safeUiMessageKey: "no_relationship",
      nextAction: "link_worker",
    };
  }

  // Relationship exists but no operational role assigned, or the role is
  // not enabled platform-wide (foreman / project_manager today).
  if (operationsRole === "not_enabled") {
    return {
      relationshipType,
      operationsRole,
      roleEnabled: false,
      journalReviewEnabled,
      reviewCapability: "not_enabled",
      coordinationStatus: "not_enabled",
      safeUiMessageKey: "role_not_assigned",
      nextAction: "assign_role",
    };
  }
  if (!roleEnabled) {
    return {
      relationshipType,
      operationsRole,
      roleEnabled,
      journalReviewEnabled,
      reviewCapability: "not_enabled",
      coordinationStatus: "not_enabled",
      safeUiMessageKey: "role_not_enabled",
      nextAction: "await_role_enablement",
    };
  }

  // Role is real + enabled. Review is granted only when explicitly
  // enabled AND the role is a reviewer role.
  const canReview =
    journalReviewEnabled && REVIEWER_ROLES.has(operationsRole);
  if (canReview) {
    return {
      relationshipType,
      operationsRole,
      roleEnabled,
      journalReviewEnabled,
      reviewCapability: "can_review",
      coordinationStatus: "active",
      safeUiMessageKey: "review_enabled",
      nextAction: "review_entries",
    };
  }

  // Enabled relationship but review not turned on → roster visibility
  // only (company/agency can see the worker, not review the journal).
  return {
    relationshipType,
    operationsRole,
    roleEnabled,
    journalReviewEnabled,
    reviewCapability: "can_view",
    coordinationStatus: "partial",
    safeUiMessageKey: "review_not_enabled",
    nextAction: "enable_review",
  };
}
