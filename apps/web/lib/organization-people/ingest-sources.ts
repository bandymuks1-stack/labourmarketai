/**
 * TURNING A FILE INTO PEOPLE — the source adapters. Pure: no IO, no env, no
 * model call. Every function here takes text or a parsed grid and returns
 * `PersonSource[]`; nothing reads a file or touches the database.
 *
 * ── WHY TABULAR IS THE PROVEN PATH AND CV IS NOT ──────────────────────────
 * A spreadsheet STATES which column is the name. A CV does not: a name has
 * to be guessed out of free text, and the cost of guessing wrong here is
 * attaching one person's professional history to another human being. So the
 * two producers are deliberately asymmetric:
 *
 *   · `peopleFromGrid` reads a declared column and is deterministic;
 *   · `personFromCvText` is CONSERVATIVE — it returns `null` whenever the
 *     first lines do not clearly read as a person's name, and the caller then
 *     asks rather than files someone under a heading.
 *
 * Both produce the SAME `PersonSource`, so the ingestion core never learns
 * where a person came from and no second ingestion architecture is needed for
 * the second format. That is the whole reason the split is safe.
 */
import { normalizeLabel } from "@/lib/timesheet-import/resolve-entities";
import { MAX_PERSON_NAME, type PersonSource } from "./ingest-core";

/** Header words that mean "this column holds the person's name". */
const NAME_HEADERS = [
  "name", "full name", "person", "employee", "worker", "candidate", "student",
  "vardas", "pavarde", "vardas pavarde", "asmuo", "darbuotojas", "kandidatas", "studentas",
  "имя", "фамилия", "фио", "сотрудник", "работник", "кандидат", "студент",
  "naam", "medewerker", "kandidaat",
  "vorname", "nachname", "mitarbeiter", "bewerber", "person name",
];

/** Header words that mean "this column holds the organization's own id". */
const REF_HEADERS = [
  "id", "ref", "reference", "employee number", "employee no", "personnel number",
  "tab nr", "tabelio nr", "darbuotojo nr", "kodas",
  "табельный номер", "номер", "код",
  "personeelsnummer", "personalnummer", "mitarbeiternummer",
];

const headerIndex = (header: readonly string[], words: readonly string[]): number => {
  for (let i = 0; i < header.length; i++) {
    const cell = normalizeLabel(header[i] ?? "");
    if (cell === "") continue;
    if (words.some((w) => cell === w)) return i;
  }
  // Only if no exact header matched, accept one that CONTAINS the word — an
  // exact match must always win, or "candidate id" would claim the name.
  for (let i = 0; i < header.length; i++) {
    const cell = normalizeLabel(header[i] ?? "");
    if (cell === "") continue;
    if (words.some((w) => cell.includes(w))) return i;
  }
  return -1;
};

export type GridReadResult =
  | { readonly kind: "people"; readonly people: readonly PersonSource[] }
  /** The file parsed but no column says who these people are. Ask. */
  | { readonly kind: "no_name_column"; readonly headers: readonly string[] }
  | { readonly kind: "empty" };

/**
 * People from a parsed spreadsheet/CSV grid.
 *
 * The first non-empty row is the header. A file with no recognisable name
 * column is NOT guessed at by taking column 0 — a sheet whose first column is
 * an employee number would then file every person under a number.
 */
export function peopleFromGrid(
  grid: readonly (readonly string[])[],
  sourceLabel: string,
): GridReadResult {
  const rows = grid.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (rows.length === 0) return { kind: "empty" };

  const header = rows[0].map((c) => String(c ?? ""));
  const nameAt = headerIndex(header, NAME_HEADERS);
  if (nameAt < 0) return { kind: "no_name_column", headers: header };
  const refAt = headerIndex(header, REF_HEADERS);

  const people: PersonSource[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = String(row[nameAt] ?? "").trim();
    if (name === "") continue; // a blank line is not a person
    const ref = refAt >= 0 && refAt !== nameAt ? String(row[refAt] ?? "").trim() : "";
    people.push({
      name,
      externalRef: ref === "" ? null : ref,
      // Provenance: the file and the line it came from, 1-based as a human
      // reading the spreadsheet would count.
      sourceNote: `${sourceLabel} · row ${r + 1}`,
    });
  }
  return { kind: "people", people };
}

/** The document's own title, folded — never a person. Five routed locales. */
const CV_HEADINGS: readonly string[] = [
  "cv",
  "curriculum vitae",
  "resume",
  "gyvenimo aprasymas",
  "lebenslauf",
  "rezjume",
  "резюме",
];

/** A token that could be part of a written personal name. */
const NAME_TOKEN = /^[\p{Lu}][\p{L}'’-]{1,}$/u;

/**
 * ONE person from the text of ONE CV — or `null`, which is the common answer.
 *
 * ── IT READS THE FIRST USABLE LINE AND STOPS ──────────────────────────────
 * An earlier draft scanned the first six lines for anything name-shaped. On
 * "CURRICULUM VITAE / Software Engineer" it skipped the heading and returned
 * "Software Engineer" as a human being — its own test caught it. Scanning
 * onwards is precisely how a heuristic invents a person: past the first line
 * a CV is job titles, section names and places, all of which are two
 * capitalised words.
 *
 * So it reads the FIRST usable line only. If that line is not clearly a
 * person's name, the answer is `null` and the caller asks whose CV it is.
 * A CV that opens with a heading yields nothing, which is correct: we do not
 * know the name, and saying so is cheap where guessing is not.
 */
export function personFromCvText(text: string, sourceLabel: string): PersonSource | null {
  const first = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l !== "");
  if (first === undefined) return null;
  if (first.length > MAX_PERSON_NAME) return null;
  // A digit, an address or a contact detail means this line is not a name.
  if (/[\d@/\\|]/.test(first)) return null;
  const normalized = normalizeLabel(first);
  if (normalized === "") return null;
  // The document's own title is not a person. "CURRICULUM VITAE" is two
  // capitalised tokens and passed every other test here — its own test caught
  // it. This is the document's name in the five routed locales, not a
  // taxonomy: it is the only heading that can occupy line one.
  if (CV_HEADINGS.includes(normalized)) return null;
  const tokens = first.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) return null;
  if (!tokens.every((t) => NAME_TOKEN.test(t))) return null;
  return { name: first, externalRef: null, sourceNote: sourceLabel };
}
