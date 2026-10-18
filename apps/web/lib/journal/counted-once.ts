/**
 * ONE ACTIVE ENTRY PER CORRECTION CHAIN — for every reader that turns journal
 * rows into NUMBERS (issue #1689, adversarial audit F1). Pure: no IO.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * Editing an UNCONFIRMED entry stamps `superseded_by` on the old row, and
 * every reader already drops superseded rows. Editing a CONFIRMED entry may
 * not touch the original (its confirmation is somebody else's evidence), so
 * the atomic-supersede RPC leaves `superseded_by` NULL and writes the new row
 * with `correction_of` → original. The calendar, the timesheets and the
 * dashboard search already replace such an original by its live correction
 * ("counted once — never twice"); the journal list core — and with it the
 * work-in-numbers section, the CV totals, the organization's member view, the
 * §13 checks and the conversation's answers — did not. A worker who logged
 * 8 h, had it approved and corrected it to 6 h read 14 h everywhere, with the
 * WITHDRAWN 8 h still shown as "confirmed".
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────
 * Among the LIVE rows (not deleted, not superseded), an entry that a live
 * row's `correction_of` points at is replaced by that correction. The
 * original is not deleted, hidden from the audit trail or re-interpreted: it
 * stays in the database with its confirmation, exactly as 0018 promised —
 * it simply stops being counted as a second day of work. The correction
 * carries no confirmation of its own until a reviewer approves it, so the
 * corrected figure honestly reads as "not yet confirmed" (SEP-3: evidence ≠
 * verification), never as inheriting the withdrawn approval.
 *
 * The de-duplication happens over the rows a read RETURNS: a correction made
 * inside a report window whose original lies outside it still replaces
 * nothing here — that is the created_at-vs-work-day question (F6), not this
 * one, and is named there.
 */

export type CorrectionChainRow = {
  readonly id: string;
  /** `journal_entries.correction_of` — the confirmed original this row
   *  corrects; absent on projections that did not select it. */
  readonly correction_of?: string | null;
};

/** The ids of every original that one of `liveRows` corrects. */
export function correctedOriginalIds(
  liveRows: readonly CorrectionChainRow[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const r of liveRows) {
    if (typeof r.correction_of === "string" && r.correction_of) {
      ids.add(r.correction_of);
    }
  }
  return ids;
}

/**
 * `liveRows` with every corrected original removed — each chain counted
 * exactly once, by its live correction. Order is preserved.
 */
export function countedOnce<T extends CorrectionChainRow>(
  liveRows: readonly T[],
): T[] {
  const corrected = correctedOriginalIds(liveRows);
  if (corrected.size === 0) return [...liveRows];
  return liveRows.filter((r) => !corrected.has(r.id));
}
