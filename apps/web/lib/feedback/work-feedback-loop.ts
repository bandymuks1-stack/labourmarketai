/**
 * Work feedback loop (full-completion train PR 7).
 *
 * The HONEST feedback loop that already exists in the product, modelled in one
 * place so the UI can explain it without inventing anything:
 *
 *   work done  →  logged in the work journal  →  a manager or client CONFIRMS
 *   the entry  →  that confirmation becomes journal-supported EVIDENCE  →
 *   evidence raises a TRUST signal on the worker's card.
 *
 * There is NO fake feedback, NO star rating, NO reputation score. Trust comes
 * only from real human confirmations of real work. This module names the
 * stages so copy + guards stay consistent; it computes no scores.
 *
 * Pure, deterministic, no DB, no external references.
 */

export type FeedbackStage =
  | "work_done"
  | "journal_logged"
  | "confirmed_by_manager_or_client"
  | "evidence"
  | "trust_signal";

export const FEEDBACK_LOOP: readonly FeedbackStage[] = [
  "work_done",
  "journal_logged",
  "confirmed_by_manager_or_client",
  "evidence",
  "trust_signal",
];

export type FeedbackLoopState = {
  /** Real journal entries the worker has logged. */
  journalEntries: number;
  /** Real manager/client confirmations on those entries. */
  confirmations: number;
};

/** The honest current stage reached, from REAL counts only. Never invents a
 *  rating — only reports how far the real loop has progressed. */
export function currentFeedbackStage(state: FeedbackLoopState): FeedbackStage {
  if (state.confirmations > 0) return "trust_signal";
  if (state.journalEntries > 0) return "journal_logged";
  return "work_done";
}

/** True only when a real human confirmation exists — the ONLY source of a
 *  trust signal. No confirmation → no trust signal (never fabricated). */
export function hasTrustSignal(state: FeedbackLoopState): boolean {
  return state.confirmations > 0;
}
