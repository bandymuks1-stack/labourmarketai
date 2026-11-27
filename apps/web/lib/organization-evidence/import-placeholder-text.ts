/**
 * IMPORTER PLACEHOLDERS ARE NOT WORK DESCRIPTIONS (owner P0 2026-11-24).
 *
 * Some historical imports wrote a fixed English sentence into a record's
 * description when the source had none ("Historical work recorded in source
 * timesheet."). That sentence is the importer's note, not what the person did,
 * and it is not in the reader's language. The stored record is never changed;
 * every surface reads its description through `workDescription` instead, and
 * shows the localized "no description in the source" label for a placeholder.
 *
 * Exact strings only (after whitespace folding, case-insensitive): a real
 * description that merely mentions a timesheet is never hidden.
 */
const PLACEHOLDERS = new Set(
  [
    "Historical work recorded in source timesheet.",
    "Historical weekly work recorded in 2026 worker-hours source.",
    "Work recorded in source timesheet; description unavailable in annual summary.",
  ].map((s) => s.toLowerCase()),
);

const fold = (s: string) => s.replace(/\s+/g, " ").trim();

export function isImportPlaceholderText(text: string | null | undefined): boolean {
  return !!text && PLACEHOLDERS.has(fold(text).toLowerCase());
}

/** The record's own description, or null when it has none (empty or a placeholder). */
export function workDescription(text: string | null | undefined): string | null {
  if (!text) return null;
  const f = fold(text);
  return f && !PLACEHOLDERS.has(f.toLowerCase()) ? text : null;
}
