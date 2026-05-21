/**
 * Skill confidence signal (PLATFORM_DOCTRINE §15, formula per task spec §6.1).
 *
 * Derived from append-only journal entries + manager confirmations — never
 * user-editable. Pure + deterministic so it can be unit-tested and (in M2+)
 * moved into a background job without behaviour change.
 */

export type ConfidenceBin = "red" | "green" | "yellow";

export type ConfidenceInputs = {
  /** # of this worker's entries for the skill that a manager has confirmed. */
  managerConfirmedEntries: number;
  /** # of this worker's self-logged entries for the skill (incl. unconfirmed). */
  selfLoggedEntries: number;
  /** # of distinct managers who have confirmed any entry for the skill. */
  uniqueConfirmers: number;
  /** Timestamp of the most recent confirmation, or null if never confirmed. */
  lastConfirmationAt: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Recency boost: +5 within 30 days, +2 within 90 days, else 0. */
export function recencyBoost(lastConfirmationAt: Date | null, now: Date = new Date()): number {
  if (!lastConfirmationAt) return 0;
  const days = (now.getTime() - lastConfirmationAt.getTime()) / DAY_MS;
  if (days <= 30) return 5;
  if (days <= 90) return 2;
  return 0;
}

/** Map a numeric score to its bin (spec §6.1: 0→red, <30→green, ≥30→yellow). */
export function binFor(score: number): ConfidenceBin {
  if (score === 0) return "red";
  if (score < 30) return "green";
  return "yellow";
}

/** Compute the confidence score (clamped to 100) and its bin. */
export function computeConfidence(
  inputs: ConfidenceInputs,
  now: Date = new Date(),
): { score: number; bin: ConfidenceBin } {
  const raw =
    inputs.managerConfirmedEntries * 3 +
    inputs.selfLoggedEntries * 1 +
    inputs.uniqueConfirmers * 5 +
    recencyBoost(inputs.lastConfirmationAt, now);
  const score = Math.min(100, Math.max(0, raw));
  return { score, bin: binFor(score) };
}
