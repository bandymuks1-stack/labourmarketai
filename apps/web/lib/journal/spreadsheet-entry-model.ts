/**
 * Spreadsheet entry mode — PURE row model (Journal Proof Engine v1, §1).
 *
 * The grid is a BULK INPUT SURFACE over the ONE journal write path: every
 * valid row becomes exactly one `createJournalEntry` FormData call (the same
 * create_journal_entry_full RPC every other mode uses) — no second journal
 * system, no batch RPC, no new table. This module holds the pure row→payload
 * mapping + validation so the component stays thin and the mapping is
 * unit-tested without React or a DB.
 *
 * Mapping rules (mirrors what the composer's review stage persists):
 *   text (+ optional note appended as a new line) → notes / original_text;
 *   date → work_date metric;
 *   quantity + unit → the `quantity` metric (unit_slug from the registry);
 *   hours → when NO quantity is given, hours ride the `quantity` metric as
 *           unit "hours" (the composer does the same); when BOTH are given,
 *           hours persist as ONE fragment_time metric row (rawPhrase = the
 *           row text) so neither real figure is dropped;
 *   engagement → engagement_context_id (required by the write path).
 *
 * Pure. No IO, no env.
 */

/** Client-side subset of the §15 productivity-unit slug registry
 *  (`productivity_units` table; labels via the productivityUnits i18n
 *  namespace). Same list the composer's quantity editor offers. */
export const SPREADSHEET_UNIT_OPTIONS = [
  "hours",
  "minutes",
  "days",
  "square_meters",
  "meters",
  "pieces",
  "kilograms",
  "packages",
] as const;
export type SpreadsheetUnitSlug = (typeof SPREADSHEET_UNIT_OPTIONS)[number];

/** Hard batch bound — bulk entry, not bulk import. */
export const SPREADSHEET_MAX_ROWS = 15;

export interface SpreadsheetRowDraft {
  /** ISO day YYYY-MM-DD. */
  workDate: string;
  /** What was done — the entry's evidence text (required). */
  text: string;
  /** Quantity as the user typed it ("" = none). */
  quantity: string;
  unitSlug: SpreadsheetUnitSlug;
  /** Duration in hours as typed ("" = none). */
  hours: string;
  /** Engagement context (organisation/project) id — required by the spine. */
  engagementId: string;
  /** Optional free-text note appended to the entry text. */
  note: string;
}

export function emptySpreadsheetRow(
  workDate: string,
  engagementId: string,
): SpreadsheetRowDraft {
  return {
    workDate,
    text: "",
    quantity: "",
    unitSlug: "hours",
    hours: "",
    engagementId,
    note: "",
  };
}

/** A row the worker has not touched — skipped silently on save. */
export function spreadsheetRowIsEmpty(row: SpreadsheetRowDraft): boolean {
  return (
    row.text.trim() === "" &&
    row.quantity.trim() === "" &&
    row.hours.trim() === "" &&
    row.note.trim() === ""
  );
}

export type SpreadsheetRowError =
  | "text_required"
  | "date_invalid"
  | "quantity_invalid"
  | "hours_invalid"
  | "engagement_required";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function parsePositiveNumber(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Validate one NON-empty row. Empty rows never reach this (they're skipped). */
export function validateSpreadsheetRow(
  row: SpreadsheetRowDraft,
): SpreadsheetRowError[] {
  const errors: SpreadsheetRowError[] = [];
  if (row.text.trim().length === 0) errors.push("text_required");
  if (!ISO_DAY.test(row.workDate.trim())) errors.push("date_invalid");
  if (row.quantity.trim() !== "" && parsePositiveNumber(row.quantity) === null)
    errors.push("quantity_invalid");
  if (row.hours.trim() !== "") {
    const h = parsePositiveNumber(row.hours);
    if (h === null || h > 24) errors.push("hours_invalid");
  }
  if (row.engagementId.trim() === "") errors.push("engagement_required");
  return errors;
}

/** Flat field map for the ONE createJournalEntry FormData contract. */
export interface SpreadsheetRowPayload {
  engagement_context_id: string;
  notes: string;
  work_date: string;
  quantity?: string;
  unit_slug?: string;
  fragments_json?: string;
}

/**
 * Map a VALIDATED row into the createJournalEntry field map. Never call with
 * a row that failed validation (the component gates on validateSpreadsheetRow).
 */
export function buildSpreadsheetRowPayload(
  row: SpreadsheetRowDraft,
): SpreadsheetRowPayload {
  const text = row.text.trim();
  const note = row.note.trim();
  const notes = note ? `${text}\n${note}` : text;
  const payload: SpreadsheetRowPayload = {
    engagement_context_id: row.engagementId.trim(),
    notes,
    work_date: row.workDate.trim(),
  };
  const qty = parsePositiveNumber(row.quantity);
  const hours = parsePositiveNumber(row.hours);
  if (qty !== null) {
    payload.quantity = String(qty);
    payload.unit_slug = row.unitSlug;
    if (hours !== null) {
      // Both figures are real — the duration persists as ONE fragment_time
      // metric (same shape the review stage saves), nothing is dropped.
      payload.fragments_json = JSON.stringify([
        {
          rawPhrase: text.slice(0, 200),
          timeValue: hours,
          timeUnit: "hours",
        },
      ]);
    }
  } else if (hours !== null) {
    payload.quantity = String(hours);
    payload.unit_slug = "hours";
  }
  return payload;
}
