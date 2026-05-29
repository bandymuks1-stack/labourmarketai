import { hasUsefulDescription } from "./request-readiness";

/**
 * Admin manual-review priority — deterministic, transparent product
 * logic (long-cycle plan PR B, option B3).
 *
 * Given only REAL request metadata (a buyer's free-text description,
 * the number of attachments already persisted, and the request status
 * the admin/buyer set), classify how a human reviewer should treat the
 * request. This is NOT AI, NOT OCR, NOT extraction, NOT verification —
 * it reads no file bytes and invents nothing.
 *
 * Statuses (sprint §B3):
 *   - review_ready          — useful description + at least one file;
 *                             a human can review it now.
 *   - manual_review_needed  — the request is flagged needs_followup;
 *                             a human already decided it needs a look.
 *   - missing_description   — files exist but the description is too
 *                             thin to act on.
 *   - missing_files         — no attachments yet.
 */

export type AdminReviewPriorityStatus =
  | "review_ready"
  | "manual_review_needed"
  | "missing_description"
  | "missing_files";

export interface AdminReviewPriorityInput {
  readonly description: string | null | undefined;
  readonly attachmentCount: number;
  /** The persisted request status (draft/submitted/in_review/...). */
  readonly status: string | null | undefined;
}

export interface AdminReviewPriority {
  readonly status: AdminReviewPriorityStatus;
  /** Sort key — LOWER surfaces higher to the admin (more actionable). */
  readonly order: number;
  readonly hasFiles: boolean;
  readonly hasUsefulDescription: boolean;
}

/** Lower = more actionable → surfaced higher in the admin list. */
const ORDER: Record<AdminReviewPriorityStatus, number> = {
  review_ready: 0,
  manual_review_needed: 1,
  missing_description: 2,
  missing_files: 3,
};

export function adminReviewPriorityOrder(
  status: AdminReviewPriorityStatus,
): number {
  return ORDER[status];
}

export function computeAdminReviewPriority(
  input: AdminReviewPriorityInput,
): AdminReviewPriority {
  const hasFiles = Number.isFinite(input.attachmentCount)
    ? input.attachmentCount > 0
    : false;
  const usefulDescription = hasUsefulDescription(input.description);

  let status: AdminReviewPriorityStatus;
  if (input.status === "needs_followup") {
    // A human already flagged this for follow-up — keep it visible.
    status = "manual_review_needed";
  } else if (!hasFiles) {
    status = "missing_files";
  } else if (!usefulDescription) {
    status = "missing_description";
  } else {
    status = "review_ready";
  }

  return {
    status,
    order: ORDER[status],
    hasFiles,
    hasUsefulDescription: usefulDescription,
  };
}
