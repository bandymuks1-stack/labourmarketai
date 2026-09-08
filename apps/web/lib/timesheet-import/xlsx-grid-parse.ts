/**
 * TIMESHEET GRID PARSER — pure. `string[][]` in, interpretation proposals out.
 *
 * No IO, no Date.now, no exceljs — the reader (`xlsx-read.ts`) owns the bytes,
 * this owns the meaning. Follows the `lib/cv/structured-parse.ts` idiom: every
 * proposal carries a confidence and a source reference, and the parser NEVER
 * invents a value it did not read. A cell it cannot interpret becomes a
 * `skipped` entry with a reason — silently dropping it would make the import
 * under-report someone's hours.
 *
 * Two sheet families are understood:
 *
 *   MONTHLY GRID — a header row of day numbers (1..31), one row per worker
 *   (optionally one row per worker × object, with the object in a second
 *   label column), hours in the day cells. The real-world template: split
 *   hours across objects, e.g. 8 h "Peleniškės" + 2 h on a second object on
 *   one day must become TWO proposals with a 10 h daily total.
 *
 *   LONG FORMAT — a fallback for simple export sheets: header row naming
 *   worker / date / object / hours columns, one fact per row.
 *
 * Ambiguity is a first-class outcome, never a guess: a split cell ("8+2")
 * whose parts do not name their objects in the sheet is emitted with
 * confidence "low" and NO object — the human picks. The month, when the sheet
 * does not state it, stays `null` and the surface asks for it explicitly.
 */

import { isValidWorkDate } from "@/lib/work-hours/allocations-model";

export type TimesheetGridProposal = {
  readonly workerLabel: string;
  /** Object label as written in the sheet; null when the sheet names none. */
  readonly objectLabel: string | null;
  /** `YYYY-MM-DD` when the sheet's month is known; null otherwise. */
  readonly workDate: string | null;
  /** 1..31 — always present for monthly grids so a user-supplied month can
   *  resolve the date later without re-parsing. */
  readonly dayOfMonth: number | null;
  readonly hours: number;
  readonly note: string | null;
  /** "high" = read directly; "low" = ambiguous, needs a human decision. */
  readonly confidence: "high" | "low";
  /** `Sheet!R<row>C<col>`, 1-based — where this number came from. */
  readonly sourceCell: string;
};

export type TimesheetSkippedCell = {
  readonly sourceCell: string;
  readonly reason: "unparsable" | "hours-out-of-bounds" | "invalid-date";
};

export type TimesheetMonth = { readonly year: number; readonly month: number };

export type TimesheetParseResult =
  | {
      readonly kind: "parsed";
      readonly layout: "monthly-grid" | "long-format";
      readonly month: TimesheetMonth | null;
      readonly proposals: readonly TimesheetGridProposal[];
      readonly skipped: readonly TimesheetSkippedCell[];
    }
  | { readonly kind: "unrecognized" };

/** Minimum length of the 1,2,3,… day run that identifies a grid header. */
const MIN_DAY_RUN = 10;

const MAX_CELL_HOURS = 24;

// ── shared helpers ───────────────────────────────────────────────────────────

function ref(sheetName: string, row0: number, col0: number): string {
  return `${sheetName}!R${row0 + 1}C${col0 + 1}`;
}

function toNumber(raw: string): number | null {
  const normalised = raw.trim().replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(normalised)) return null;
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

const NO_WORK_CELL = /^(-|–|—|0|x|\.)*$/i;

/** Labels that are structure, not people — totals rows must not become
 *  proposals against a "worker" called "Total". */
const TOTAL_LABEL =
  /^(total|sum|iš ?viso|viso|suma|itogo|итого|всего|kokku|kopā|razem|summa|gesamt|totaal)\b/i;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// ── month detection ──────────────────────────────────────────────────────────

/** Month names the pilot's documents actually carry (LT genitive + nominative,
 *  EN, RU). Extending this list is data, not structure. */
const MONTH_NAMES: readonly (readonly [RegExp, number])[] = [
  // Latin stems carry a \b; the Cyrillic alternatives stand alone because
  // JS \b is ASCII-only and would silently never match beside Cyrillic.
  [/\b(january|sausi)|январ/i, 1],
  [/\b(february|vasari)|феврал/i, 2],
  [/\b(march|kov[ao])|март/i, 3],
  [/\b(april|baland)|апрел/i, 4],
  [/\b(may|geguž)|ма[йя]/i, 5],
  [/\b(june|biržel)|июн/i, 6],
  [/\b(july|liep[ao])|июл/i, 7],
  [/\b(august|rugpj)|август/i, 8],
  [/\b(september|rugsėj)|сентябр/i, 9],
  [/\b(october|spali)|октябр/i, 10],
  [/\b(november|lapkri[čt])|ноябр/i, 11],
  [/\b(december|gruod)|декабр/i, 12],
];

/**
 * Find the sheet's own statement of its month, when it makes one. First match
 * wins; no match means NO month — never "probably this month".
 */
export function detectTimesheetMonth(
  rows: readonly (readonly string[])[],
): TimesheetMonth | null {
  for (const row of rows) {
    for (const cell of row) {
      if (cell === "" || cell.length > 120) continue;
      // "2026-05", "2026.05", "2026/05" — year first.
      let m = cell.match(/\b(20\d{2})\s*[-./]\s*(0?[1-9]|1[0-2])(?!\d)/);
      if (m) return { year: Number(m[1]), month: Number(m[2]) };
      // "05/2026", "5.2026" — month first.
      m = cell.match(/\b(0?[1-9]|1[0-2])\s*[-./]\s*(20\d{2})\b/);
      if (m) return { year: Number(m[2]), month: Number(m[1]) };
      // "2026 m. gegužė" / "May 2026" — a month name with a year beside it.
      const year = cell.match(/\b(20\d{2})\b/);
      if (year) {
        for (const [rx, month] of MONTH_NAMES) {
          if (rx.test(cell)) return { year: Number(year[1]), month };
        }
      }
    }
  }
  return null;
}

// ── hour-cell parsing ────────────────────────────────────────────────────────

type CellPart = { readonly hours: number; readonly objectLabel: string | null };

type CellParse =
  | { readonly kind: "none" }
  | { readonly kind: "parts"; readonly parts: readonly CellPart[]; readonly ambiguous: boolean }
  | { readonly kind: "bad-hours" }
  | { readonly kind: "unparsable" };

/** One part of an hour cell: a number, optionally annotated with the object it
 *  belongs to — "8", "8 Peleniškės", "8 (01)". A bare annotation must START
 *  with a letter so time-like cells ("8:30") are refused, not misread as an
 *  object called "30". */
function parsePart(raw: string): CellPart | null {
  const m = raw
    .trim()
    .match(/^(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:\(([^)]+)\)|(\p{L}[^+/;()]*))?$/u);
  if (!m) return null;
  const hours = toNumber(m[1]);
  if (hours === null) return null;
  const label = (m[2] ?? m[3])?.trim().replace(/^[.:_-]+|[.:_-]+$/g, "").trim();
  return { hours, objectLabel: label ? label : null };
}

/**
 * Interpret one day cell. The split-hours rule, verbatim from the template:
 * "8+2" / "8/2" with objects named per part → one part per object,
 * confidence high; without named objects the SPLIT is real but the mapping is
 * not stated, so the parts come back `ambiguous` — the surface must make a
 * human choose, never this parser.
 */
export function parseHourCell(raw: string): CellParse {
  const text = raw.trim();
  if (text === "" || NO_WORK_CELL.test(text)) return { kind: "none" };

  const single = parsePart(text);
  if (single) {
    if (single.hours <= 0) return { kind: "none" };
    if (single.hours > MAX_CELL_HOURS) return { kind: "bad-hours" };
    return { kind: "parts", parts: [single], ambiguous: false };
  }

  const pieces = text.split(/[+/;]/);
  if (pieces.length >= 2) {
    const parts = pieces.map(parsePart);
    if (parts.every((p): p is CellPart => p !== null)) {
      const kept = parts.filter((p) => p.hours > 0);
      if (kept.length === 0) return { kind: "none" };
      if (kept.some((p) => p.hours > MAX_CELL_HOURS)) return { kind: "bad-hours" };
      // Explicit mapping = EVERY part names its object. A half-named split
      // is still a guess, and guesses are the human's to make.
      const explicit = kept.every((p) => p.objectLabel !== null);
      return {
        kind: "parts",
        parts: explicit ? kept : kept.map((p) => ({ hours: p.hours, objectLabel: null })),
        ambiguous: !explicit,
      };
    }
  }

  return { kind: "unparsable" };
}

// ── monthly grid ─────────────────────────────────────────────────────────────

type DayHeader = {
  readonly rowIndex: number;
  /** column index → day-of-month */
  readonly dayByCol: ReadonlyMap<number, number>;
  readonly firstDayCol: number;
};

/** A header row is the one holding the 1,2,3,… run in contiguous columns. */
function findDayHeader(rows: readonly (readonly string[])[]): DayHeader | null {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c].trim() !== "1") continue;
      const dayByCol = new Map<number, number>();
      let day = 1;
      let col = c;
      while (col < row.length && row[col].trim() === String(day) && day <= 31) {
        dayByCol.set(col, day);
        day++;
        col++;
      }
      if (dayByCol.size >= MIN_DAY_RUN) {
        return { rowIndex: r, dayByCol, firstDayCol: c };
      }
    }
  }
  return null;
}

/** A label column whose data cells are just 1,2,3,… is a row-number column
 *  ("Eil. Nr."), not a name column. */
function isSequentialIndexColumn(values: readonly string[]): boolean {
  const nonEmpty = values.filter((v) => v !== "");
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every((v, i) => v === String(i + 1));
}

function parseMonthlyGrid(
  rows: readonly (readonly string[])[],
  sheetName: string,
  header: DayHeader,
  month: TimesheetMonth | null,
): { proposals: TimesheetGridProposal[]; skipped: TimesheetSkippedCell[] } {
  const dataRows = rows.slice(header.rowIndex + 1);

  // Label columns sit LEFT of the day run. Among those with content, the
  // first non-index column names the worker; a second one (when present)
  // names the object — the per-worker-per-object row family.
  const labelCols: number[] = [];
  for (let c = 0; c < header.firstDayCol; c++) {
    const values = dataRows.map((row) => (row[c] ?? "").trim());
    if (values.every((v) => v === "")) continue;
    if (isSequentialIndexColumn(values)) continue;
    labelCols.push(c);
  }
  const workerCol = labelCols[0] ?? null;
  const objectCol = labelCols.length > 1 ? labelCols[1] : null;

  const proposals: TimesheetGridProposal[] = [];
  const skipped: TimesheetSkippedCell[] = [];
  if (workerCol === null) return { proposals, skipped };

  // Carried across continuation rows: "Vitalii | Object 01 | …" followed by
  // "        | Object 05 | …" is one worker, two object rows.
  let currentWorker = "";

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowIndex0 = header.rowIndex + 1 + i;
    const ownLabel = (row[workerCol] ?? "").trim();
    if (ownLabel !== "") {
      if (TOTAL_LABEL.test(ownLabel)) {
        currentWorker = ""; // a totals block ends the worker list
        continue;
      }
      currentWorker = ownLabel;
    }
    if (currentWorker === "") continue;

    const rowObject = objectCol !== null ? (row[objectCol] ?? "").trim() || null : null;

    for (const [col, day] of header.dayByCol) {
      const cellRaw = row[col] ?? "";
      const sourceCell = ref(sheetName, rowIndex0, col);
      const parsed = parseHourCell(cellRaw);
      if (parsed.kind === "none") continue;
      if (parsed.kind === "bad-hours") {
        skipped.push({ sourceCell, reason: "hours-out-of-bounds" });
        continue;
      }
      if (parsed.kind === "unparsable") {
        skipped.push({ sourceCell, reason: "unparsable" });
        continue;
      }

      let workDate: string | null = null;
      if (month !== null) {
        const iso = `${month.year}-${pad2(month.month)}-${pad2(day)}`;
        if (!isValidWorkDate(iso)) {
          // Day 31 in a 30-day month: the grid has the column, the month
          // does not have the day. An hour recorded there is a defect to
          // surface, not a date to invent.
          skipped.push({ sourceCell, reason: "invalid-date" });
          continue;
        }
        workDate = iso;
      }

      for (const part of parsed.parts) {
        proposals.push({
          workerLabel: currentWorker,
          // An ambiguous split may NOT inherit the row's object — "8/2" in an
          // Object 01 row usually means 8 h there and 2 h somewhere else, and
          // which is which is the human's call, not this parser's.
          objectLabel: parsed.ambiguous ? null : (part.objectLabel ?? rowObject),
          workDate,
          dayOfMonth: day,
          hours: part.hours,
          note: null,
          confidence: parsed.ambiguous ? "low" : "high",
          sourceCell,
        });
      }
    }
  }

  return { proposals, skipped };
}

// ── long format ──────────────────────────────────────────────────────────────

const LONG_HEADERS = {
  worker: /^(worker|employee|name|darbuotojas|vardas|darbininkas|работник|имя)/i,
  date: /^(date|data|datum|дата|diena)/i,
  object: /^(object|objektas|site|объект|projektas|project)/i,
  hours: /^(hours|val(andos)?\.?|h|часы|stundos)/i,
  note: /^(note|pastab|komentar|comment|примечан)/i,
} as const;

function findLongHeader(rows: readonly (readonly string[])[]): {
  rowIndex: number;
  worker: number;
  date: number;
  hours: number;
  object: number | null;
  note: number | null;
} | null {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const row = rows[r];
    const find = (rx: RegExp) => row.findIndex((cell) => rx.test(cell.trim()));
    const worker = find(LONG_HEADERS.worker);
    const date = find(LONG_HEADERS.date);
    const hours = find(LONG_HEADERS.hours);
    if (worker >= 0 && date >= 0 && hours >= 0) {
      const object = find(LONG_HEADERS.object);
      const note = find(LONG_HEADERS.note);
      return {
        rowIndex: r,
        worker,
        date,
        hours,
        object: object >= 0 ? object : null,
        note: note >= 0 ? note : null,
      };
    }
  }
  return null;
}

/** `2026-05-12`, `12.05.2026`, `12/05/2026` → ISO. Day-first for the dotted
 *  and slashed European forms this pilot's documents use. */
function toIsoDate(raw: string): string | null {
  const text = raw.trim();
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    return isValidWorkDate(iso) ? iso : null;
  }
  m = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`;
    return isValidWorkDate(iso) ? iso : null;
  }
  return null;
}

function parseLongFormat(
  rows: readonly (readonly string[])[],
  sheetName: string,
  header: NonNullable<ReturnType<typeof findLongHeader>>,
): { proposals: TimesheetGridProposal[]; skipped: TimesheetSkippedCell[] } {
  const proposals: TimesheetGridProposal[] = [];
  const skipped: TimesheetSkippedCell[] = [];

  for (let r = header.rowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const workerLabel = (row[header.worker] ?? "").trim();
    const dateRaw = (row[header.date] ?? "").trim();
    const hoursRaw = (row[header.hours] ?? "").trim();
    if (workerLabel === "" && dateRaw === "" && hoursRaw === "") continue;
    if (TOTAL_LABEL.test(workerLabel)) continue;

    const sourceCell = ref(sheetName, r, header.hours);
    if (workerLabel === "" || dateRaw === "" || hoursRaw === "") {
      skipped.push({ sourceCell, reason: "unparsable" });
      continue;
    }
    const workDate = toIsoDate(dateRaw);
    if (workDate === null) {
      skipped.push({ sourceCell: ref(sheetName, r, header.date), reason: "invalid-date" });
      continue;
    }
    const hours = toNumber(hoursRaw);
    if (hours === null) {
      skipped.push({ sourceCell, reason: "unparsable" });
      continue;
    }
    if (hours <= 0 || hours > MAX_CELL_HOURS) {
      skipped.push({ sourceCell, reason: "hours-out-of-bounds" });
      continue;
    }
    const objectLabel =
      header.object !== null ? (row[header.object] ?? "").trim() || null : null;
    const note = header.note !== null ? (row[header.note] ?? "").trim() || null : null;

    proposals.push({
      workerLabel,
      objectLabel,
      workDate,
      dayOfMonth: Number(workDate.slice(8, 10)),
      hours,
      note,
      confidence: "high",
      sourceCell,
    });
  }

  return { proposals, skipped };
}

// ── entry point ──────────────────────────────────────────────────────────────

/**
 * Parse one sheet. Monthly grid is tried first (it is the real-world
 * template); the long format is the fallback; anything else is honestly
 * `unrecognized` — never a best-effort guess at somebody's hours.
 */
export function parseTimesheetSheet(
  rows: readonly (readonly string[])[],
  sheetName = "Sheet",
): TimesheetParseResult {
  const header = findDayHeader(rows);
  if (header) {
    const month = detectTimesheetMonth(rows);
    const { proposals, skipped } = parseMonthlyGrid(rows, sheetName, header, month);
    if (proposals.length > 0 || skipped.length > 0) {
      return { kind: "parsed", layout: "monthly-grid", month, proposals, skipped };
    }
  }

  const longHeader = findLongHeader(rows);
  if (longHeader) {
    const { proposals, skipped } = parseLongFormat(rows, sheetName, longHeader);
    if (proposals.length > 0 || skipped.length > 0) {
      return { kind: "parsed", layout: "long-format", month: null, proposals, skipped };
    }
  }

  return { kind: "unrecognized" };
}
