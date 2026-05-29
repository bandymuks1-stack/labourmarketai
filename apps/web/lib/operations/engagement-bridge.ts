import {
  isOperationsRoleEnabled,
  type OperationsRoleId,
} from "./role-capabilities";

/**
 * Employment ↔ work-journal **engagement-context bridge readiness** — pure,
 * deterministic (slice engagement-context-ops-bridge-v1).
 *
 * The work-journal review chain is real on the journal ORG model
 * (`organizations` + `engagement_contexts` + `manages_organization` RLS,
 * migration 0013): a manager reviews a worker's entries when the entry's
 * `engagement_context.organization_id` is an org they manage. The employment
 * link tables (`company_workers` / `agency_workers`, migrations 0027 / 0001 +
 * the 0030 bridge columns) are NOT yet connected to that model — nothing
 * provisions an `engagement_context` from an employment relationship.
 *
 * This module does NOT provision anything and grants no capability. It only
 * CLASSIFIES whether a relationship is ready to be connected to a journal
 * engagement context, and — crucially — whether journal review could later be
 * enabled for it. Honest-by-design:
 *   - review can NEVER be ready from a stored label alone (foreman /
 *     project_manager stay `not_enabled`; a plain `worker` is `not_allowed`);
 *   - review is only ever "ready"/"connected" when an engagement context
 *     actually links the worker to the org AND the role is a reviewer role;
 *   - until the provisioning RPC ships, `engagementContextLinked` is false for
 *     every employment relationship (see EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE),
 *     so the honest state is `missing_engagement_context`.
 */

export type EngagementBridgeState =
  | "connected"
  | "review_not_enabled"
  | "missing_engagement_context"
  | "role_not_assigned"
  | "relationship_not_found"
  | "not_allowed"
  | "not_enabled";

/**
 * Whether the employment→journal engagement-context bridge is LIVE in the
 * product. It is `false` until a dedicated, owner/migration-gated provisioning
 * RPC connects an employment relationship to a journal `engagement_context`.
 * Until then no relationship has a real org engagement link, so the UI passes
 * `engagementContextLinked: false` and the honest state stays
 * `missing_engagement_context`. Flipping this is NOT enough on its own — the
 * provisioning RPC + a real per-row read must land first.
 */
export const EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE = false;

/** Reviewer-eligible roles — mirrors REVIEWER_ROLES in
 *  employment-journal-context.ts. Only these could ever review when both a
 *  real engagement context exists AND journal_review_enabled is true. */
const REVIEWER_ROLES: ReadonlySet<string> = new Set([
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

export interface EngagementBridgeInput {
  /** The company_workers / agency_workers relationship row exists. */
  readonly relationshipExists: boolean;
  /** Assigned operations_role (migration 0030), or null/blank. */
  readonly operationsRole?: string | null;
  /** journal_review_enabled column (default false). */
  readonly journalReviewEnabled?: boolean | null;
  /** Whether an active engagement_context already links this relationship's
   *  worker to the org. False for every relationship until the provisioning
   *  RPC ships (see EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE). */
  readonly engagementContextLinked?: boolean | null;
}

export interface EngagementBridgeReadiness {
  readonly state: EngagementBridgeState;
  /** True only when a real engagement context links the worker to the org AND
   *  the role is reviewer-eligible — i.e. journal review could be safely set
   *  for this relationship. NEVER true from a label alone. */
  readonly bridgeReady: boolean;
  /** True only when the bridge is ready AND journal_review_enabled is already
   *  true. The UI may claim review is active ONLY when this is true. */
  readonly reviewActive: boolean;
  /** Stable key the UI maps to a localized reason / next-action string. */
  readonly reasonKey: EngagementBridgeState;
}

/**
 * Classify whether an employment relationship can be connected to a work
 * journal engagement context (and whether review could later be enabled).
 * Pure: no IO, no AI, no network, no writes.
 */
export function computeEngagementBridgeReadiness(
  input: EngagementBridgeInput,
): EngagementBridgeReadiness {
  const deny = (state: EngagementBridgeState): EngagementBridgeReadiness => ({
    state,
    bridgeReady: false,
    reviewActive: false,
    reasonKey: state,
  });

  if (!input.relationshipExists) return deny("relationship_not_found");

  const role = (input.operationsRole ?? "").trim();
  // No role, or an unrecognised label → must assign a valid role first.
  if (role === "" || !KNOWN_ROLES.has(role)) return deny("role_not_assigned");

  // A label that is not an enabled platform role (foreman / project_manager)
  // can NEVER anchor a review connection — it is a label, not a permission.
  if (!isOperationsRoleEnabled(role as OperationsRoleId)) {
    return deny("not_enabled");
  }

  // Enabled, but not a reviewer-eligible role (e.g. a plain `worker`): review
  // cannot be enabled for this relationship.
  if (!REVIEWER_ROLES.has(role)) return deny("not_allowed");

  // Reviewer-eligible role. Now the data bridge must actually exist.
  const linked = input.engagementContextLinked === true;
  if (!linked) return deny("missing_engagement_context");

  // Bridge present + reviewer role → review CAN be enabled.
  const reviewActive = input.journalReviewEnabled === true;
  return {
    state: reviewActive ? "connected" : "review_not_enabled",
    bridgeReady: true,
    reviewActive,
    reasonKey: reviewActive ? "connected" : "review_not_enabled",
  };
}
