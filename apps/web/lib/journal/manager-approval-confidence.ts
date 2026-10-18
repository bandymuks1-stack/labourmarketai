/**
 * Manager-approval skill confidence (owner decision R-5, 2026-10-08).
 *
 * PURE mirror of the bounded contribution computed inside the SECURITY DEFINER
 * function `recompute_worker_skill_confidence_from_manager_approval_v1`
 * (supabase/migrations/20261008120000_*). The database is the authority; this
 * module exists so the bound, the idempotency and the "never verifies" rules
 * are unit-tested and so the two constants cannot drift unnoticed (a guard
 * test reads the migration and compares them).
 *
 * Rules (all pinned by manager-approval-confidence.test.ts):
 *  - the input is the number of DISTINCT effectively-approved live entries
 *    linked to the skill - never a count of approvals or of reviewers, so a
 *    second reviewer approving the same entry changes nothing;
 *  - the contribution is bounded below the 30 "substantiated" band: manager
 *    approval alone never reads as substantiation;
 *  - this path touches confidence only. It never sets `verified`, `source` or
 *    any provenance; those move only through confirm_entry_and_verify_skills;
 *  - counterparty acceptance (`client_accept`) is not an input.
 */

/** Confidence points per distinct manager-approved entry linked to the skill. */
export const APPROVAL_CONFIDENCE_PER_ENTRY = 3;
/** Hard cap of this path; deliberately < 30 (the "substantiated" band). */
export const APPROVAL_CONFIDENCE_CAP = 27;

/** Deterministic, idempotent score from the DISTINCT approved-entry count. */
export function approvalConfidenceScore(distinctApprovedEntries: number): number {
  const n = Number.isFinite(distinctApprovedEntries)
    ? Math.max(0, Math.floor(distinctApprovedEntries))
    : 0;
  return Math.min(APPROVAL_CONFIDENCE_CAP, APPROVAL_CONFIDENCE_PER_ENTRY * n);
}

/** Stored score after an approval recompute: raise-only, never lowers. */
export function nextStoredConfidence(stored: number, distinctApprovedEntries: number): number {
  return Math.max(stored, approvalConfidenceScore(distinctApprovedEntries));
}

/** Bin written by this path (matches the SQL CASE). */
export function approvalConfidenceBin(score: number, current: "red" | "green" | "yellow") {
  if (score >= 1 && score <= 29) return "green" as const;
  if (score >= 30) return "yellow" as const;
  return current;
}

/** The only worker_skills columns this path may ever write. */
export const APPROVAL_CONFIDENCE_WRITABLE_COLUMNS = [
  "confidence_score",
  "confidence_bin",
  "last_recompute_at",
] as const;

/** Statuses the RPC returns (text). `raised:<n>` is the success form. */
export type ApprovalConfidenceStatus =
  | "entry_not_found"
  | "not_authorized"
  | "not_approved_by_caller"
  | `raised:${number}`;

export function parseApprovalConfidenceStatus(
  raw: unknown,
): { ok: true; raised: number } | { ok: false; code: string } {
  if (typeof raw !== "string") return { ok: false, code: "error" };
  const m = /^raised:(\d+)$/.exec(raw);
  if (m) return { ok: true, raised: Number(m[1]) };
  return { ok: false, code: raw };
}
