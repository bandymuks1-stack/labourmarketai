import type { TimesheetGridProposal } from "@/lib/timesheet-import/xlsx-grid-parse";
import { SOURCE_ROW_FIELDS, tidy, type SourceWorkRow, type SourceRowField } from "@/lib/work-history/source-rows";

/**
 * SOURCE -> CANONICAL ROWS. Pure: text or a string grid in, `SourceWorkRow[]`
 * out. No IO, no clock, no database.
 *
 * This is the extension point the architecture promised (5.2, and the
 * extensibility contract in ARCHITECTURE 6): ERP, payroll, Drive, email and an
 * agent's structured submission each need a function that ends here. They do
 * NOT need a second import pipeline, a second preview or a second evidence
 * table.
 *
 * ── THE HONESTY RULE, MECHANISED ───────────────────────────────────────────
 * Every row this module emits carries `factFields` (what the source stated in
 * so many words) and `derived` (what was worked out, with method and
 * confidence). The functions below add a field to `factFields` only when they
 * read it out of a cell. Everything else - a date reconstructed from a month
 * the human typed in, an object carried down from the row above, a
 * description assembled because the sheet had none - is DERIVED and says so.
 *
 * The rule is asserted, not just documented: `sourceWorkRowSchema` refuses a
 * row that lists the same field as both fact and inference.
 */

// ── delimited text (CSV / TSV) ──────────────────────────────────────────────

export const MAX_DELIMITED_BYTES = 5 * 1024 * 1024;
export const MAX_DELIMITED_ROWS = 20_000;

/**
 * RFC4180-ish parser: quoted fields, doubled quotes inside them, CR/LF inside
 * them, and a delimiter sniffed from the header line (comma, semicolon or tab
 * - European exports use all three). Deliberately small; a spreadsheet that
 * needs more than this is an XLSX and goes through exceljs.
 */
export function parseDelimited(text: string): string[][] {
  const body = text.replace(/^﻿/, "");
  const header = body.slice(0, body.search(/\r?\n/) === -1 ? body.length : body.search(/\r?\n/));
  const delimiter =
    header.includes("\t") ? "\t" : (header.split(";").length > header.split(",").length ? ";" : ",");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (rows.length >= MAX_DELIMITED_ROWS) return rows;
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ── header recognition ──────────────────────────────────────────────────────

/**
 * Column synonyms across the languages the real files are written in. Slug
 * only, no translation storage (doctrine 2.1-2.2): these are matching keys,
 * not user-facing copy.
 */
const HEADER_SYNONYMS: Readonly<Record<SourceRowField, readonly string[]>> = {
  personLabel: [
    "worker", "employee", "name", "person", "full name", "surname name",
    "darbuotojas", "vardas", "pavarde", "vardas pavarde", "pavarde vardas", "asmuo",
    "pracownik", "imie nazwisko", "mitarbeiter", "medewerker",
    "rabotnik", "sotrudnik", "fio",
  ],
  externalRef: [
    "employee no", "employee number", "personnel number", "staff id", "tab no",
    "tabelis", "tabelio nr", "darbuotojo nr", "personalo nr", "nr",
    "personalnummer", "personeelsnummer", "tabelnyj nomer",
  ],
  projectLabel: [
    "object", "site", "project", "address", "location", "workplace",
    "objektas", "objektai", "statybvete", "projektas", "adresas", "vieta", "darbo vieta",
    "obiekt", "projekt", "adres", "baustelle", "objekt", "locatie",
    "obekt", "adres raboty",
  ],
  workDate: [
    "date", "work date", "day",
    "data", "diena", "darbo data",
    "datum", "dag", "data pracy", "data raboty",
  ],
  periodStart: [
    "from", "period start", "start", "week start", "date from",
    "nuo", "laikotarpio pradzia", "pradzia", "savaites pradzia",
    "von", "vanaf", "od", "s data",
  ],
  periodEnd: [
    "to", "period end", "end", "week end", "date to",
    "iki", "laikotarpio pabaiga", "pabaiga", "savaites pabaiga",
    "bis", "tot", "do", "po data",
  ],
  hours: [
    "hours", "hrs", "h", "worked hours", "total hours",
    "valandos", "val", "darbo valandos", "isdirbta",
    "stunden", "uren", "godziny", "chasy",
  ],
  workText: [
    "description", "work", "works", "task", "tasks", "notes", "comment", "activity",
    "aprasymas", "darbai", "atlikti darbai", "uzduotis", "pastabos", "veikla",
    "beschreibung", "omschrijving", "opis", "opisanie", "vypolnennye raboty",
  ],
};

/** Fold a header cell to a comparison key: lowercase, diacritics stripped,
 *  punctuation collapsed. Same folding as the entity resolver so "Pavardė"
 *  and "pavarde" are one header. */
function headerKey(cell: string): string {
  return cell
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export type ColumnMap = Partial<Record<SourceRowField, number>>;

/** Map a header row to canonical columns. Unrecognised columns are kept out of
 *  the map but stay in `raw` - nothing from the source is discarded. */
export function mapHeaderRow(header: readonly string[]): ColumnMap {
  const map: ColumnMap = {};
  header.forEach((cell, index) => {
    const key = headerKey(cell);
    if (key === "") return;
    for (const field of SOURCE_ROW_FIELDS) {
      if (map[field] !== undefined) continue;
      const synonyms = HEADER_SYNONYMS[field];
      if (synonyms.includes(key)) {
        map[field] = index;
        return;
      }
    }
  });
  return map;
}

// ── value readers ───────────────────────────────────────────────────────────

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/;
const YMD_DOT = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** `YYYY-MM-DD`, or null when the cell is not a date this parser can read
 *  WITHOUT guessing. An ambiguous `03/04/2023` in a sheet with no other clue
 *  is read as day-first (the European convention of every market this ships
 *  in) and reported as DERIVED by the caller - never as a source fact. */
export function readDate(raw: string): { iso: string; ambiguous: boolean } | null {
  const value = raw.trim();
  if (value === "") return null;
  const iso = ISO_DATE.exec(value);
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return isRealDate(y, m, d) ? { iso: value, ambiguous: false } : null;
  }
  const ymd = YMD_DOT.exec(value);
  if (ymd) {
    const [y, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
    return isRealDate(y, m, d) ? { iso: `${y}-${pad2(m)}-${pad2(d)}`, ambiguous: false } : null;
  }
  const dmy = DMY.exec(value);
  if (dmy) {
    const [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
    if (!isRealDate(y, m, d)) return null;
    // Day-first is unambiguous once the first number cannot be a month.
    return { iso: `${y}-${pad2(m)}-${pad2(d)}`, ambiguous: d <= 12 };
  }
  return null;
}

/** Hours as a number, accepting the comma decimal separator every European
 *  export uses. Null when the cell is not a number - never zero-by-default,
 *  which would under-report someone's work as "0 hours worked". */
export function readHours(raw: string): number | null {
  const value = raw.trim().replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 9999 ? n : null;
}

// ── grid -> canonical rows ──────────────────────────────────────────────────

export interface TabularParseResult {
  readonly rows: readonly SourceWorkRow[];
  /** Source lines that could not become a row, with the reason. Reported, not
   *  dropped: a silently skipped line is missing history nobody notices. */
  readonly skipped: readonly { readonly rowIndex: number; readonly reason: string }[];
  readonly columns: ColumnMap;
}

/**
 * Long-format table (one fact per line) with a recognised header row.
 * The header may be preceded by title lines: the first row that maps BOTH a
 * person column and something datable wins.
 */
export function rowsFromGrid(grid: readonly (readonly string[])[]): TabularParseResult {
  let headerIndex = -1;
  let columns: ColumnMap = {};
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const candidate = mapHeaderRow(grid[i]);
    if (
      candidate.personLabel !== undefined &&
      (candidate.workDate !== undefined || candidate.periodStart !== undefined)
    ) {
      headerIndex = i;
      columns = candidate;
      break;
    }
  }
  if (headerIndex === -1) {
    return { rows: [], skipped: [{ rowIndex: 0, reason: "no_header" }], columns: {} };
  }

  const header = grid[headerIndex];
  const rows: SourceWorkRow[] = [];
  const skipped: { rowIndex: number; reason: string }[] = [];

  for (let i = headerIndex + 1; i < grid.length; i++) {
    const line = grid[i];
    if (line.every((c) => c.trim() === "")) continue;

    const raw: Record<string, string> = {};
    header.forEach((h, index) => {
      const name = tidy(h) || `column_${index + 1}`;
      raw[name] = line[index] ?? "";
    });

    const cell = (field: SourceRowField): string => {
      const index = columns[field];
      return index === undefined ? "" : (line[index] ?? "").trim();
    };

    const personLabel = tidy(cell("personLabel"));
    if (personLabel === "") {
      skipped.push({ rowIndex: i, reason: "no_person" });
      continue;
    }

    const factFields: SourceRowField[] = ["personLabel"];
    const derived: Record<string, { value: string | number | null; method: string; confidence: number }> = {};

    let workDate: string | null = null;
    const dateCell = cell("workDate");
    if (dateCell !== "") {
      const read = readDate(dateCell);
      if (read) {
        workDate = read.iso;
        if (read.ambiguous) {
          derived.workDate = { value: read.iso, method: "date_day_first", confidence: 0.6 };
        } else {
          factFields.push("workDate");
        }
      }
    }

    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    const startCell = cell("periodStart");
    if (startCell !== "") {
      const read = readDate(startCell);
      if (read) {
        periodStart = read.iso;
        if (read.ambiguous) {
          derived.periodStart = { value: read.iso, method: "date_day_first", confidence: 0.6 };
        } else factFields.push("periodStart");
      }
    }
    const endCell = cell("periodEnd");
    if (endCell !== "") {
      const read = readDate(endCell);
      if (read) {
        periodEnd = read.iso;
        if (read.ambiguous) {
          derived.periodEnd = { value: read.iso, method: "date_day_first", confidence: 0.6 };
        } else factFields.push("periodEnd");
      }
    }

    if (workDate === null && periodStart === null) {
      skipped.push({ rowIndex: i, reason: "no_date" });
      continue;
    }

    let hours: number | null = null;
    const hoursCell = cell("hours");
    if (hoursCell !== "") {
      hours = readHours(hoursCell);
      if (hours !== null) factFields.push("hours");
      else skipped.push({ rowIndex: i, reason: "unreadable_hours" });
    }

    const projectCell = tidy(cell("projectLabel"));
    if (projectCell !== "") factFields.push("projectLabel");

    const externalRef = tidy(cell("externalRef"));
    if (externalRef !== "") factFields.push("externalRef");

    const workTextCell = tidy(cell("workText"));
    let workText = workTextCell;
    if (workTextCell !== "") {
      factFields.push("workText");
    } else {
      // No description column. The row is still real work; what it was is
      // simply not recorded, and saying so is the honest reading. The place
      // label is used as the subject because it is the only thing the source
      // actually says about the work - and it is marked DERIVED.
      workText = projectCell !== "" ? projectCell : personLabel;
      derived.workText = {
        value: workText,
        method: "no_description_in_source",
        confidence: 0.2,
      };
    }

    rows.push({
      personLabel,
      externalRef: externalRef === "" ? null : externalRef,
      projectLabel: projectCell === "" ? null : projectCell,
      workDate,
      periodStart,
      periodEnd,
      hours,
      workText,
      raw,
      factFields,
      derived,
    });
  }

  return { rows, skipped, columns };
}

/**
 * The monthly-grid family, via the timesheet importer's own parser.
 *
 * `parseTimesheetSheet` already understands the real templates (a day-number
 * header, one line per worker, hours split across objects in one cell) and is
 * tested against them. Reusing it means the two importers cannot disagree
 * about what a sheet says. What this adds is the fact/derived bookkeeping the
 * hours importer does not need:
 *
 *   - hours are a FACT (a number read from a cell);
 *   - the object is a FACT when the sheet names it on that line, and DERIVED
 *     when the parser carried it from a heading or could not name it;
 *   - the date is a FACT when the sheet states the month, and DERIVED when a
 *     human supplied the month afterwards;
 *   - there is no description at all in a grid, so `workText` is always
 *     DERIVED, at low confidence, from the object label.
 */
export function rowsFromTimesheetProposals(
  proposals: readonly TimesheetGridProposal[],
  opts: { readonly monthFromSheet: boolean },
): readonly SourceWorkRow[] {
  const rows: SourceWorkRow[] = [];
  for (const p of proposals) {
    if (p.workDate === null) continue;
    const factFields: SourceRowField[] = ["personLabel", "hours"];
    const derived: Record<string, { value: string | number | null; method: string; confidence: number }> = {};

    if (opts.monthFromSheet) factFields.push("workDate");
    else {
      derived.workDate = {
        value: p.workDate,
        method: "month_supplied_by_importer",
        confidence: 0.8,
      };
    }

    if (p.objectLabel !== null && p.confidence === "high") {
      factFields.push("projectLabel");
    } else if (p.objectLabel !== null) {
      derived.projectLabel = {
        value: p.objectLabel,
        method: "object_split_cell",
        confidence: 0.4,
      };
    }

    const workText = p.note?.trim() || p.objectLabel?.trim() || p.workerLabel;
    derived.workText = {
      value: workText,
      method: "no_description_in_grid",
      confidence: 0.2,
    };

    rows.push({
      personLabel: p.workerLabel,
      externalRef: null,
      projectLabel: p.objectLabel,
      workDate: p.workDate,
      periodStart: null,
      periodEnd: null,
      hours: p.hours,
      workText,
      raw: {
        worker: p.workerLabel,
        object: p.objectLabel,
        date: p.workDate,
        hours: p.hours,
        note: p.note,
        sourceCell: p.sourceCell,
      },
      factFields,
      derived,
    });
  }
  return rows;
}
