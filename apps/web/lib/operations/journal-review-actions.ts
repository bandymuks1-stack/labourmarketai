/**
 * Shared server-action types for the engagement-context provisioning button and
 * the journal-review enable/disable toggle (slice
 * feat/journal-review-enable-toggle-v1). Pure types only — no IO, no server.
 *
 * These mirror the text outcomes of the SECURITY DEFINER RPCs:
 *   - provision_{company,agency}_worker_engagement_context (migration 0032)
 *   - set_{company,agency}_worker_journal_review           (migration 0033)
 *
 * They are deliberately shared so the single WorkerOperationsRoleForm can be
 * wired to either the company OR the agency server actions with one type.
 *
 * Honest-by-design: the toggle can only ever request enable when the relationship
 * is genuinely bridge-ready (a real active engagement_context). The RPC remains
 * the real security boundary; these types just carry its verdict to the UI.
 */

/** Text outcomes of the 0032 provisioning RPCs. */
export type ProvisionEngagementOutcome =
  | "connected"
  | "already_connected"
  | "not_owner"
  | "not_linked"
  | "profile_missing"
  | "role_not_assigned"
  | "role_not_allowed"
  | "organization_missing";

/** Shared server-action state for the provisioning button (company OR agency).
 *  `no_org` = the caller has no owned company/agency. */
export type ProvisionEngagementActionState =
  | { ok: true; outcome: ProvisionEngagementOutcome }
  | { ok: false; code: "no_org" | "needs_migration" | "error"; message?: string };

/** Text outcomes of the 0033 set-journal-review RPCs. */
export type SetJournalReviewOutcome =
  | "enabled"
  | "already_enabled"
  | "disabled"
  | "already_disabled"
  | "not_owner"
  | "not_linked"
  | "role_not_assigned"
  | "role_not_allowed"
  | "profile_missing"
  | "organization_missing"
  | "engagement_context_missing";

/** Shared server-action state for the journal-review toggle (company OR agency). */
export type SetJournalReviewActionState =
  | { ok: true; outcome: SetJournalReviewOutcome }
  | { ok: false; code: "no_org" | "needs_migration" | "error"; message?: string };
