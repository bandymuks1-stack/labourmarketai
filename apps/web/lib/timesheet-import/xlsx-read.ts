import "server-only";

/**
 * TIMESHEET XLSX READER — bytes in, a plain string grid out.
 *
 * The ONLY module that touches `exceljs`, and it uses it strictly read-only:
 * a Buffer goes in, `string[][]` per sheet comes out, and nothing about the
 * workbook (styles, formulas, macros, links) survives past this boundary.
 * The pure parser next door (`xlsx-grid-parse.ts`) never sees exceljs types,
 * so it stays testable without a workbook fixture.
 *
 * Bounds mirror `lib/cv/extract.ts` (the audited upload path):
 *   - magic-byte check BEFORE the parser sees the bytes (XLSX is a zip:
 *     `PK\x03\x04`) — a file that only claims to be XLSX is refused, not
 *     handed to a zip reader;
 *   - input byte cap + output cell cap (a zip can decompress to far more
 *     than its input size — the cell cap bounds the work that actually grows);
 *   - wall-clock parse timeout so the REQUEST never hangs on a pathological
 *     file (JS cannot cancel the underlying work; honest limitation);
 *   - tagged result union, never a throw — parser internals never leak.
 */

export const MAX_TIMESHEET_XLSX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Output bound: cells actually materialized across all sheets. A month of a
 *  large crew is ~32 columns × ~60 rows ≈ 2k cells — this is generous. */
export const MAX_TIMESHEET_CELLS = 200_000;

/** Structural caps per sheet — a timesheet grid is wide-ish, never endless. */
const MAX_ROWS_PER_SHEET = 2_000;
const MAX_COLS_PER_SHEET = 64;
const MAX_SHEETS = 10;

const PARSE_TIMEOUT_MS = 10_000;

export type XlsxSheetGrid = {
  readonly name: string;
  /** Row-major, 0-based, dense (empty cells are "") — positions matter to the
   *  grid parser, so gaps are preserved as empty strings, never dropped. */
  readonly rows: readonly (readonly string[])[];
};

export type XlsxReadResult =
  | { kind: "ok"; sheets: readonly XlsxSheetGrid[] }
  | { kind: "too-large" }
  | { kind: "not-xlsx" }
  | { kind: "too-complex" }
  | { kind: "empty" }
  | { kind: "failed" };

/** XLSX is a zip container: "PK\x03\x04". Nothing else is handed to exceljs. */
function looksLikeXlsx(buffer: ArrayBuffer): boolean {
  const head = new Uint8Array(buffer.slice(0, 4));
  return (
    head.length === 4 &&
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    head[2] === 0x03 &&
    head[3] === 0x04
  );
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`timesheet-xlsx: parse exceeded ${PARSE_TIMEOUT_MS}ms`)),
        PARSE_TIMEOUT_MS,
      ).unref?.(),
    ),
  ]);
}

/**
 * One cell to text. Deliberately lossy in exactly one direction: everything
 * becomes the string an operator would read in the cell. Dates become
 * `YYYY-MM-DD` (the platform's day key), rich text collapses to its text,
 * formulas collapse to their cached RESULT (never re-evaluated), errors and
 * unknown shapes become "" — a value this reader cannot honestly render must
 * not be invented.
 */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "1" : "";
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as readonly { text?: unknown }[])
        .map((rt) => (typeof rt.text === "string" ? rt.text : ""))
        .join("")
        .trim();
    }
    if ("result" in o) return cellText(o.result); // formula: cached result only
    if (typeof o.text === "string") return o.text.trim(); // hyperlink
  }
  return "";
}

/**
 * Read an XLSX workbook into plain string grids. Never throws; the caller
 * authenticates and size-caps before invoking (re-checked defensively here).
 */
export async function readTimesheetXlsx(buffer: Buffer): Promise<XlsxReadResult> {
  if (buffer.byteLength === 0) return { kind: "empty" };
  if (buffer.byteLength > MAX_TIMESHEET_XLSX_BYTES) return { kind: "too-large" };
  // Copy into a fresh ArrayBuffer: a Buffer may be a view into a shared pool,
  // and exceljs wants the plain unshared thing.
  const arrayBuffer = new Uint8Array(buffer).buffer;
  if (!looksLikeXlsx(arrayBuffer)) return { kind: "not-xlsx" };

  try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await withTimeout(workbook.xlsx.load(arrayBuffer));

    const sheets: XlsxSheetGrid[] = [];
    let totalCells = 0;

    for (const sheet of workbook.worksheets.slice(0, MAX_SHEETS)) {
      const rowCount = Math.min(sheet.rowCount ?? 0, MAX_ROWS_PER_SHEET);
      const colCount = Math.min(sheet.columnCount ?? 0, MAX_COLS_PER_SHEET);
      if (rowCount === 0 || colCount === 0) continue;

      totalCells += rowCount * colCount;
      if (totalCells > MAX_TIMESHEET_CELLS) return { kind: "too-complex" };

      const rows: string[][] = [];
      for (let r = 1; r <= rowCount; r++) {
        const row = sheet.getRow(r);
        const cells: string[] = [];
        for (let c = 1; c <= colCount; c++) {
          cells.push(cellText(row.getCell(c).value));
        }
        rows.push(cells);
      }
      // A sheet with no textual content at all carries no timesheet.
      if (rows.some((cells) => cells.some((cell) => cell !== ""))) {
        sheets.push({ name: sheet.name || `Sheet${sheets.length + 1}`, rows });
      }
    }

    if (sheets.length === 0) return { kind: "empty" };
    return { kind: "ok", sheets };
  } catch {
    // Never surface the underlying parser error (could echo file bytes).
    return { kind: "failed" };
  }
}
