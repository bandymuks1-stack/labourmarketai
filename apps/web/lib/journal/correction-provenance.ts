/**
 * WHAT A CORRECTION ANSWERED — the decision provenance of a correction chain,
 * read for the card of its live correction. Pure: no IO.
 *
 * ── THE GAP (production walk work-verification, 2026-10-25, PR #2786) ─────
 * A manager returns (`changes_requested`) or rejects an entry; the worker
 * answers with a correction (`journal_entry_supersede_v2`: a NEW entry whose
 * `correction_of` points at the decided original, which keeps its decision
 * row). The list core counts the chain ONCE, by its live correction
 * (`counted-once.ts`), and moves the original into `correctedOriginals`. The
 * diary is built from `entries` only — so after answering, the worker saw
 * nowhere that the entry had been returned or rejected, or what the
 * manager's note said. The decision was true only in the database.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────
 * For every counted entry that corrects an original, walk the chain back
 * through `correctedOriginals` (a correction of a correction leads further
 * back) and take, per original, its LATEST employer decision with its real
 * note (`deriveReviewTimeline` — counterparty rows excluded, a missing note
 * stays null, nothing invented). Nearest first.
 *
 * This is PROVENANCE, not a state and not a count:
 *   · the correction's own evidence state stays its own (SEP-3) — a step
 *     here never makes the correction read "returned" or "confirmed";
 *   · no original becomes a card, and nothing here carries hours or skills
 *     (decision 0025: every work hour once — the chain counts by its
 *     correction only);
 *   · an original with no decision adds no step (it was an unconfirmed edit
 *     or an outside-window read — nothing to say, so nothing is said).
 */

import {
  deriveReviewTimeline,
  type ConfirmationRow,
  type ReviewDecision,
} from "@/lib/journal/review-status";

export type CorrectionProvenanceStep = {
  /** The decided original this step is about (never rendered as a card). */
  readonly originalId: string;
  /** The original's latest employer decision. */
  readonly result: ReviewDecision;
  /** The reviewer's engagement role (manager / owner / external_manager). */
  readonly role: string | null;
  /** When the decision was recorded (ISO), as stored. */
  readonly at: string | null;
  /** The reviewer's REAL note, trimmed; null when none was given. */
  readonly note: string | null;
};

type ChainRow = {
  readonly id: string;
  readonly correction_of?: string | null;
  readonly journal_entry_confirmations?: readonly ConfirmationRow[] | null;
};

/** A walk never runs longer than this — a guard against a malformed cycle,
 *  not a product limit (real chains are one or two steps). */
const MAX_CHAIN_STEPS = 50;

/**
 * `correctionId → steps` (nearest decided original first) for every entry in
 * `entries` whose chain reaches a decided original in `correctedOriginals`.
 * Entries without such a chain are absent (not an empty list).
 */
export function deriveCorrectionProvenance(
  entries: readonly ChainRow[],
  correctedOriginals: readonly ChainRow[],
): Record<string, readonly CorrectionProvenanceStep[]> {
  const byId = new Map(correctedOriginals.map((o) => [o.id, o]));
  const out: Record<string, readonly CorrectionProvenanceStep[]> = {};
  for (const entry of entries) {
    const steps: CorrectionProvenanceStep[] = [];
    const seen = new Set<string>([entry.id]);
    let nextId = entry.correction_of ?? null;
    while (nextId && !seen.has(nextId) && seen.size <= MAX_CHAIN_STEPS) {
      seen.add(nextId);
      const original = byId.get(nextId);
      if (!original) break;
      const latest = deriveReviewTimeline(original.journal_entry_confirmations).at(-1);
      if (latest) {
        steps.push({
          originalId: original.id,
          result: latest.result,
          role: latest.role,
          at: latest.at,
          note: latest.note,
        });
      }
      nextId = original.correction_of ?? null;
    }
    if (steps.length > 0) out[entry.id] = steps;
  }
  return out;
}
