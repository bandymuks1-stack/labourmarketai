/**
 * Booking notes - HUMAN note vs SYSTEM provenance (handoff 2026-10-02 §9B).
 *
 * `booking_requests.note` is shown to people as if the other party wrote it.
 * Until 20260928210000 the agency-offer accept path wrote an English system
 * string into it ("Agency candidate offer accepted"); the SQL no longer does,
 * but rows written before that still carry it. A system string is provenance,
 * not a message: it must not reach either party as copy. A note a person
 * actually wrote is never touched.
 */
const SYSTEM_PROVENANCE_NOTES: ReadonlySet<string> = new Set([
  "agency candidate offer accepted",
]);

/** The note a person wrote, or `null` (absent, blank, or system provenance). */
export function humanBookingNote(note: string | null | undefined): string | null {
  const trimmed = (note ?? "").trim();
  if (trimmed === "") return null;
  return SYSTEM_PROVENANCE_NOTES.has(trimmed.toLowerCase()) ? null : trimmed;
}

/** The previously agreed terms, or `null` when no previous date was ever
 *  recorded - a dash is not a fact, so the "earlier agreed: ..." line is then
 *  not shown at all. */
export function previousAgreedTerms(
  terms: { startDate: string | null; expectedEndDate: string | null } | null | undefined,
): { startDate: string | null; expectedEndDate: string | null } | null {
  if (!terms) return null;
  if (!terms.startDate && !terms.expectedEndDate) return null;
  return terms;
}
