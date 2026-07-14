/**
 * MANUAL IMPORT parsers (Manual Import Sandbox v1) — CSV / JSON / NDJSON
 * adapters for OWNER-SUPPLIED LOCAL FILES only. No downloads, no fetch,
 * no filesystem access: the caller hands the file CONTENT in as a string
 * (bounded), and the parser returns plain row records or a stable refusal
 * reason code. No stack traces, no partial guesses.
 *
 * Bounds are hard: an over-size file or over-long row set is refused, not
 * truncated silently (silent truncation would fake completeness).
 *
 * Pure module: no IO, no Date.now.
 */

export const MANUAL_IMPORT_FORMATS = ["csv", "json", "ndjson"] as const;
export type ManualImportFormat = (typeof MANUAL_IMPORT_FORMATS)[number];

/** Hard input bounds — refuse beyond, never truncate silently. */
export const MANUAL_IMPORT_MAX_BYTES = 1_000_000;
export const MANUAL_IMPORT_MAX_ROWS = 500;

export type ManualImportParseReasonCode =
  | "file_too_large"
  | "empty_file"
  | "too_many_rows"
  | "unknown_format"
  | "invalid_json"
  | "json_not_an_array"
  | "json_row_not_object"
  | "ndjson_line_invalid"
  | "csv_missing_header"
  | "csv_row_column_mismatch"
  | "csv_unterminated_quote";

export type ManualImportParseResult =
  | { readonly ok: true; readonly rows: readonly Record<string, unknown>[] }
  | {
      readonly ok: false;
      readonly reasonCode: ManualImportParseReasonCode;
      /** 1-based row/line number when the refusal is row-specific. */
      readonly rowNumber?: number;
    };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** Split one CSV line honouring double-quoted fields ("" escapes a quote).
 *  Returns null on an unterminated quote. */
function splitCsvLine(line: string): string[] | null {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  if (inQuotes) return null;
  fields.push(field);
  return fields;
}

function parseCsv(content: string): ManualImportParseResult {
  const lines = content
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) return { ok: false, reasonCode: "empty_file" };
  const header = splitCsvLine(lines[0]);
  if (header === null) {
    return { ok: false, reasonCode: "csv_unterminated_quote", rowNumber: 1 };
  }
  if (header.length === 0 || header.every((h) => h.trim() === "")) {
    return { ok: false, reasonCode: "csv_missing_header" };
  }
  if (lines.length - 1 > MANUAL_IMPORT_MAX_ROWS) {
    return { ok: false, reasonCode: "too_many_rows" };
  }
  const keys = header.map((h) => h.trim());
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    if (fields === null) {
      return {
        ok: false,
        reasonCode: "csv_unterminated_quote",
        rowNumber: i + 1,
      };
    }
    if (fields.length !== keys.length) {
      return {
        ok: false,
        reasonCode: "csv_row_column_mismatch",
        rowNumber: i + 1,
      };
    }
    const row: Record<string, unknown> = {};
    for (let k = 0; k < keys.length; k++) {
      // Empty cells become null (honest absence, never empty-string data).
      const value = fields[k].trim();
      row[keys[k]] = value === "" ? null : value;
    }
    rows.push(row);
  }
  return { ok: true, rows };
}

// ── JSON / NDJSON ────────────────────────────────────────────────────────────

function parseJsonArray(content: string): ManualImportParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Reason code only — never a stack trace or parser internals.
    return { ok: false, reasonCode: "invalid_json" };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, reasonCode: "json_not_an_array" };
  }
  if (parsed.length === 0) return { ok: false, reasonCode: "empty_file" };
  if (parsed.length > MANUAL_IMPORT_MAX_ROWS) {
    return { ok: false, reasonCode: "too_many_rows" };
  }
  for (let i = 0; i < parsed.length; i++) {
    if (!isPlainObject(parsed[i])) {
      return { ok: false, reasonCode: "json_row_not_object", rowNumber: i + 1 };
    }
  }
  return { ok: true, rows: parsed as Record<string, unknown>[] };
}

function parseNdjson(content: string): ManualImportParseResult {
  const lines = content
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) return { ok: false, reasonCode: "empty_file" };
  if (lines.length > MANUAL_IMPORT_MAX_ROWS) {
    return { ok: false, reasonCode: "too_many_rows" };
  }
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < lines.length; i++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[i]);
    } catch {
      return { ok: false, reasonCode: "ndjson_line_invalid", rowNumber: i + 1 };
    }
    if (!isPlainObject(parsed)) {
      return { ok: false, reasonCode: "ndjson_line_invalid", rowNumber: i + 1 };
    }
    rows.push(parsed);
  }
  return { ok: true, rows };
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function parseManualImportFile(
  content: string,
  format: ManualImportFormat,
): ManualImportParseResult {
  if (content.length > MANUAL_IMPORT_MAX_BYTES) {
    return { ok: false, reasonCode: "file_too_large" };
  }
  if (content.trim() === "") {
    return { ok: false, reasonCode: "empty_file" };
  }
  switch (format) {
    case "csv":
      return parseCsv(content);
    case "json":
      return parseJsonArray(content);
    case "ndjson":
      return parseNdjson(content);
    default:
      return { ok: false, reasonCode: "unknown_format" };
  }
}
