import type { ReviewCapability } from "@/lib/operations/employment-journal-context";

/**
 * Manual work-journal review readiness — pure, deterministic (12-step
 * cycle Step 7). Composes the employment↔journal review capability with
 * an entry's real state into one conservative verdict. No DB, no AI, no
 * fake approvals.
 *
 * Conservative rules (in order):
 *   - reviewer cannot review (no employment context, journal_review_enabled
 *     false, or a foreman/PM label without real permission) → not_enabled
 *   - entry already has a manager confirmation                → reviewed
 *   - entry lacks useful detail to review                     → missing_details
 *   - otherwise                                               → needs_review
 */

export type JournalReviewReadiness =
  | "not_enabled"
  | "reviewed"
  | "missing_details"
  | "needs_review";

export interface JournalReviewReadinessInput {
  /** From computeEmploymentJournalContext — gates the whole thing. */
  readonly reviewCapability: ReviewCapability;
  /** Does the entry already carry a manager confirmation row? */
  readonly entryHasConfirmation: boolean;
  /** Does the entry have enough free text/detail to act on? */
  readonly entryHasUsefulText: boolean;
}

export function computeJournalReviewReadiness(
  input: JournalReviewReadinessInput,
): JournalReviewReadiness {
  // Only an explicit can_review capability unlocks review. can_view /
  // not_enabled (incl. every foreman/PM case) → not_enabled.
  if (input.reviewCapability !== "can_review") return "not_enabled";
  if (input.entryHasConfirmation) return "reviewed";
  if (!input.entryHasUsefulText) return "missing_details";
  return "needs_review";
}
