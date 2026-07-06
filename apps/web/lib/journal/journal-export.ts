import { csvCell } from "@/lib/projects/operations-report";

/**
 * Work-journal CSV export builder (quality-train PR I) — PURE, DB-free.
 *
 * Serialises the worker's OWN journal entries (already read under their own
 * RLS — see the export route) into a spreadsheet-friendly CSV. It NEVER
 * invents a value: no entries produce a header-only CSV; linked skills are
 * the durable journal_entry_skills links (evidence support, not
 * verification — the column name says "linked", never "verified").
 */

export interface JournalExportRow {
  readonly createdAt: string;
  readonly entryType: string;
  readonly language: string;
  readonly text: string;
  /** Durable journal_entry_skills links (catalogue slugs). */
  readonly linkedSkillSlugs: readonly string[];
}

export const JOURNAL_CSV_HEADER = [
  "created_at",
  "entry_type",
  "language",
  "entry_text",
  "linked_skills",
] as const;

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(",");
}

/** Build the full CSV string for a work-journal export. */
export function buildJournalCsv(rows: readonly JournalExportRow[]): string {
  const lines: string[] = [];
  lines.push(csvRow([...JOURNAL_CSV_HEADER]));
  for (const r of rows) {
    lines.push(
      csvRow([
        r.createdAt,
        r.entryType,
        r.language,
        r.text,
        r.linkedSkillSlugs.join("|"),
      ]),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/** Filesystem-safe filename, stamped with the export day. */
export function journalCsvFilename(isoDay: string): string {
  return `work-journal-${isoDay}.csv`;
}
