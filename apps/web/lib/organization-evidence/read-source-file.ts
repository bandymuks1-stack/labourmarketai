import "server-only";

import { fingerprintBytes, fingerprintPayload } from "./fingerprint";
import type { SourceWorkRow } from "./source-rows";

/**
 * SOURCE FILE → STAGEABLE WORK ROWS — the one composition the historical
 * import was missing.
 *
 * Every part of this already existed and was tested; nothing composed them.
 * `readTimesheetXlsx` (the only module that touches exceljs, with its
 * magic-byte check, byte cap, cell cap and parse timeout) produced sheets,
 * `parseTimesheetSheet` understood the real monthly-grid and long-format
 * templates, and `rowsFromTimesheetProposals` carried the fact/derived
 * bookkeeping across into `SourceWorkRow` — with ZERO callers repo-wide. The
 * evidence importer meanwhile called `await file.text()` on whatever arrived
 * and fed the result to `parseDelimited`. An .xlsx is a zip, so that returned
 * mojibake and the import died as `nothing_parsed`, while the source-kind
 * picker offered `xlsx` and the file input refused to accept one.
 *
 * The result: an organisation's real historical timesheets could not enter
 * the product at all, and the only alternative was re-typing a year of work
 * one journal entry at a time.
 *
 * WHAT THIS DOES NOT DO. It reads. It stages nothing, writes nothing and
 * decides nothing about people — person matching, duplicate classification,
 * preview and the commit token all stay exactly where they are, in
 * `import-core.ts`. A spreadsheet arriving is still not a commit.
 */

/** Same ceiling the audited readers already enforce (`xlsx-read.ts`). */
export const SOURCE_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** Sheets to read from one workbook. `readTimesheetXlsx` caps at 10. */
const MAX_SHEETS = 10;

export type SourceFileRead =
  | {
      readonly kind: "ok";
      readonly rows: readonly SourceWorkRow[];
      readonly skipped: readonly { readonly rowIndex: number; readonly reason: string }[];
      /** How the bytes were understood — carried into the import notes. */
      readonly via: "delimited" | "xlsx-grid";
      /** Stable identity of THIS source, so re-uploading resolves to the same session. */
      readonly fingerprint: string;
    }
  | { readonly kind: "unsupported-file"; readonly filename: string }
  | { readonly kind: "file-too-large"; readonly limit: number }
  | { readonly kind: "file-unreadable" }
  /** A monthly grid that never states its month: every date would be invented. */
  | { readonly kind: "month-not-stated" }
  | { readonly kind: "nothing-parsed"; readonly detail: string };

const isXlsxName = (n: string): boolean => /\.(xlsx|xlsm)$/i.test(n);

/**
 * Read an uploaded workbook or delimited file into stageable rows.
 *
 * `filename` decides the reader, exactly as `readPeopleFile` already does for
 * the roster half — one convention, not two.
 */
export async function readEvidenceSourceFile(
  filename: string,
  bytes: Buffer,
): Promise<SourceFileRead> {
  if (bytes.byteLength === 0) return { kind: "nothing-parsed", detail: "empty" };
  if (bytes.byteLength > SOURCE_FILE_MAX_BYTES) {
    return { kind: "file-too-large", limit: SOURCE_FILE_MAX_BYTES };
  }
  const name = filename || "file";

  if (!isXlsxName(name)) {
    const { parseDelimited, rowsFromGrid } = await import("./parse-tabular");
    const parsed = rowsFromGrid(parseDelimited(bytes.toString("utf8")));
    if (parsed.rows.length === 0) {
      return { kind: "nothing-parsed", detail: parsed.skipped[0]?.reason ?? "empty" };
    }
    return {
      kind: "ok",
      rows: parsed.rows,
      skipped: parsed.skipped,
      via: "delimited",
      // Unchanged from the original text path, so a file already imported
      // keeps resolving to its existing session.
      fingerprint: fingerprintPayload("web-source", { raw: bytes.toString("utf8") }),
    };
  }

  const { readTimesheetXlsx } = await import("@/lib/timesheet-import/xlsx-read");
  const read = await readTimesheetXlsx(bytes);
  if (read.kind === "too-large") return { kind: "file-too-large", limit: SOURCE_FILE_MAX_BYTES };
  if (read.kind === "empty") return { kind: "nothing-parsed", detail: "empty" };
  if (read.kind !== "ok") return { kind: "file-unreadable" };

  const { parseTimesheetSheet } = await import("@/lib/timesheet-import/xlsx-grid-parse");
  const { rowsFromTimesheetProposals } = await import("./parse-tabular");

  const rows: SourceWorkRow[] = [];
  const skipped: { rowIndex: number; reason: string }[] = [];
  let anyRecognised = false;
  let anyDatedProposal = false;

  for (const [index, sheet] of read.sheets.slice(0, MAX_SHEETS).entries()) {
    const name = sheet.name || `Sheet${index + 1}`;
    const parse = parseTimesheetSheet(sheet.rows, name);
    if (parse.kind !== "parsed") continue;
    anyRecognised = true;
    if (parse.proposals.some((p) => p.workDate !== null)) anyDatedProposal = true;
    // The date is a FACT when the sheet itself stated the month (monthly grid)
    // or carried a real date column (long format); it is never derived here,
    // because nothing in this path supplies a month from outside.
    rows.push(...rowsFromTimesheetProposals(parse.proposals, { monthFromSheet: true }));

    // A YEAR IN ONE WORKBOOK is the real shape of this source, and sheets in
    // it are not uniform: if January names its month and February does not,
    // `rowsFromTimesheetProposals` drops February's undated proposals on the
    // floor. Dropping them is right — a date nobody stated may not be
    // invented — but dropping them SILENTLY is missing history nobody
    // notices, so each one is reported as skipped with its sheet named.
    const undated = parse.proposals.filter((p) => p.workDate === null).length;
    if (undated > 0) {
      skipped.push({ rowIndex: index, reason: `${name}: month_not_stated x${undated}` });
    }
    for (const s of parse.skipped) {
      // The grid parser reports a cell reference, not a row index; keep the
      // reference in the reason so a skipped hour stays findable.
      skipped.push({ rowIndex: index, reason: `${s.sourceCell}: ${s.reason}` });
    }
  }

  if (rows.length === 0) {
    if (!anyRecognised) return { kind: "nothing-parsed", detail: "no_header" };
    // Recognised as a timesheet, but every proposal lacked a date. That is a
    // monthly grid whose month is nowhere on the sheet — inventing one would
    // date a person's real work to a month nobody stated (SEP-1).
    if (!anyDatedProposal) return { kind: "month-not-stated" };
    return { kind: "nothing-parsed", detail: skipped[0]?.reason ?? "empty" };
  }

  return {
    kind: "ok",
    rows,
    skipped,
    via: "xlsx-grid",
    // Binary bytes, not text: `toString("utf8")` on a zip is lossy, so two
    // different workbooks could otherwise fingerprint alike.
    fingerprint: fingerprintBytes(bytes),
  };
}
