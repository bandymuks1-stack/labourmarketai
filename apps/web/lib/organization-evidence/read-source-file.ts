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
      /** Each row's source position (see `TabularParseResult.positions`),
       *  unique across the whole file — a workbook's sheets each reserve
       *  their own range — so the same bytes always stage the same rows at
       *  the same indexes. */
      readonly positions: readonly number[];
      readonly skipped: readonly { readonly rowIndex: number; readonly reason: string }[];
      /** Source lines no row was made from, by position (`no_date`, `no_person`). */
      readonly notStaged: readonly { readonly position: number; readonly reason: string }[];
      /** How the bytes were understood — carried into the import notes. */
      readonly via: "delimited" | "xlsx-grid";
      /** Stable identity of THIS source, so re-uploading resolves to the same session. */
      readonly fingerprint: string;
      /** `sha256(bytes)`, plain hex, for EVERY file — CSV included (design v3
       *  §9.1). Beside the fingerprint, never instead of it: a file already
       *  imported keeps resolving to its session. */
      readonly bytesSha256: string;
      /** The header cells the parser recognised (first sheet / the file),
       *  for the language detection the action performs. Empty for a grid. */
      readonly headers: readonly string[];
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
  const bytesSha256 = fingerprintBytes(bytes);

  if (!isXlsxName(name)) {
    const { parseDelimited, rowsFromGrid } = await import("./parse-tabular");
    const parsed = rowsFromGrid(parseDelimited(bytes.toString("utf8")));
    if (parsed.rows.length === 0) {
      return { kind: "nothing-parsed", detail: parsed.skipped[0]?.reason ?? "empty" };
    }
    return {
      kind: "ok",
      rows: parsed.rows,
      positions: parsed.positions,
      skipped: parsed.skipped,
      notStaged: parsed.notStaged,
      headers: Object.keys(parsed.rows[0]?.raw ?? {}),
      via: "delimited",
      // Unchanged from the original text path, so a file already imported
      // keeps resolving to its existing session.
      fingerprint: fingerprintPayload("web-source", { raw: bytes.toString("utf8") }),
      bytesSha256,
    };
  }

  const { readTimesheetXlsx } = await import("@/lib/timesheet-import/xlsx-read");
  const read = await readTimesheetXlsx(bytes);
  if (read.kind === "too-large") return { kind: "file-too-large", limit: SOURCE_FILE_MAX_BYTES };
  if (read.kind === "empty") return { kind: "nothing-parsed", detail: "empty" };
  if (read.kind !== "ok") return { kind: "file-unreadable" };

  const { parseTimesheetSheet } = await import("@/lib/timesheet-import/xlsx-grid-parse");
  const { rowsFromGrid, rowsFromTimesheetProposals } = await import("./parse-tabular");

  const rows: SourceWorkRow[] = [];
  const positions: number[] = [];
  const skipped: { rowIndex: number; reason: string }[] = [];
  const notStaged: { position: number; reason: string }[] = [];
  let anyRecognised = false;
  let anyDatedProposal = false;
  let headers: readonly string[] = [];
  // Each sheet reserves its own range of source positions, so positions stay
  // unique across a workbook and identical bytes always give identical ones.
  let offset = 0;

  for (const [index, sheet] of read.sheets.slice(0, MAX_SHEETS).entries()) {
    const name = sheet.name || `Sheet${index + 1}`;
    // A LONG-FORMAT sheet (one fact per line, a person column and a date
    // column) is the shape of the owner's prepared history and of most ERP /
    // payroll exports. It goes through the SAME parser a CSV does — header
    // synonyms in the source languages, the fact/derived split, the source
    // week vs explicit date comparison — instead of the monthly-grid parser,
    // which knows none of that. The grid parser stays for the grids.
    const long = rowsFromGrid(sheet.rows);
    if (long.rows.length > 0) {
      anyRecognised = true;
      anyDatedProposal = true;
      if (headers.length === 0) headers = Object.keys(long.rows[0].raw);
      rows.push(...long.rows);
      positions.push(...long.positions.map((p) => offset + p));
      for (const s of long.skipped) {
        skipped.push({ rowIndex: index, reason: `${name}!row${s.rowIndex + 1}: ${s.reason}` });
      }
      notStaged.push(...long.notStaged.map((s) => ({ position: offset + s.position, reason: s.reason })));
      offset += sheet.rows.length;
      continue;
    }
    const parse = parseTimesheetSheet(sheet.rows, name);
    if (parse.kind !== "parsed") continue;
    anyRecognised = true;
    if (parse.proposals.some((p) => p.workDate !== null)) anyDatedProposal = true;
    // The date is a FACT when the sheet itself stated the month (monthly grid)
    // or carried a real date column (long format); it is never derived here,
    // because nothing in this path supplies a month from outside.
    const gridRows = rowsFromTimesheetProposals(parse.proposals, { monthFromSheet: true });
    rows.push(...gridRows);
    // A grid has no line per fact; its facts are numbered in the order the
    // parser reads them, which is fixed for fixed bytes.
    positions.push(...gridRows.map((_, i) => offset + i));
    offset += Math.max(gridRows.length, sheet.rows.length);

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
    positions,
    skipped,
    notStaged,
    headers,
    via: "xlsx-grid",
    // Binary bytes, not text: `toString("utf8")` on a zip is lossy, so two
    // different workbooks could otherwise fingerprint alike.
    fingerprint: fingerprintBytes(bytes),
    bytesSha256,
  };
}
