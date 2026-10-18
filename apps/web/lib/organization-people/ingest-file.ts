import "server-only";

import { MAX_PEOPLE_PER_BATCH, type PersonSource } from "./ingest-core";

/**
 * A FILE OF PEOPLE → CANONICAL `PersonSource` ROWS. One reader, every
 * transport.
 *
 * The web panel hands this a `File` from a form post; an authorized assistant
 * over `/api/mcp` hands it the same bytes it received from ChatGPT. Neither
 * gets its own parser, its own format list or its own byte cap — a file that
 * is refused in the browser is refused identically through an assistant, and
 * a file that parses parses to the same rows.
 *
 * NOTHING HERE WRITES, and nothing here decides who anybody is. It turns
 * bytes into candidate rows; `planPeopleIngest` decides what those rows mean
 * against the roster, and a human decides the rest.
 */

/** What a person may attach. Deliberately short — these are name lists, not
 *  document archives, and the readers below have their own inner caps. */
export const PEOPLE_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** The formats a workforce list may honestly arrive in TODAY.
 *
 *  PDF/DOCX CVs are deliberately absent. A CV parsed for a name alone would
 *  import the person and silently discard their entire professional history,
 *  which reads to the organization as "imported" and to the person as erasure.
 *  Refusing is the honest answer until professional history has somewhere
 *  truthful to land. */
export const SUPPORTED_PEOPLE_FILE_EXTENSIONS = [
  "xlsx",
  "xlsm",
  "csv",
  "tsv",
  "txt",
] as const;

export type PeopleFileRead =
  | { readonly kind: "ok"; readonly people: readonly PersonSource[] }
  | { readonly kind: "no-name-column"; readonly headers: readonly string[] }
  | { readonly kind: "unsupported-file"; readonly filename: string }
  | { readonly kind: "file-too-large"; readonly limit: number }
  | { readonly kind: "too-many-rows"; readonly limit: number }
  | { readonly kind: "nothing-parsed" };

const isXlsxName = (n: string): boolean => /\.(xlsx|xlsm)$/i.test(n);
const isDelimitedName = (n: string): boolean => /\.(csv|tsv|txt)$/i.test(n);

/**
 * FILE → PEOPLE, on the server, through the AUDITED readers.
 *
 * XLSX goes through `readTimesheetXlsx` — the only module that touches
 * exceljs, with its magic-byte check, byte cap, cell cap and parse timeout.
 * CSV/TSV/TXT goes through `parseDelimited`. Neither reader is re-implemented
 * and no new file format is invented here.
 */
export async function readPeopleFile(
  filename: string,
  bytes: Buffer,
): Promise<PeopleFileRead> {
  if (bytes.byteLength === 0) return { kind: "nothing-parsed" };
  if (bytes.byteLength > PEOPLE_FILE_MAX_BYTES) {
    return { kind: "file-too-large", limit: PEOPLE_FILE_MAX_BYTES };
  }
  const name = filename || "file";

  let grid: readonly (readonly string[])[] = [];
  if (isXlsxName(name)) {
    const { readTimesheetXlsx } = await import("@/lib/timesheet-import/xlsx-read");
    const read = await readTimesheetXlsx(bytes);
    if (read.kind !== "ok") return { kind: "unsupported-file", filename: name };
    grid = read.sheets[0]?.rows ?? [];
  } else if (isDelimitedName(name)) {
    const { parseDelimited } = await import("@/lib/organization-evidence/parse-tabular");
    grid = parseDelimited(bytes.toString("utf8"));
  } else {
    return { kind: "unsupported-file", filename: name };
  }

  const { peopleFromGrid } = await import("./ingest-sources");
  const read = peopleFromGrid(grid, name);
  if (read.kind === "empty") return { kind: "nothing-parsed" };
  if (read.kind === "no_name_column") {
    return { kind: "no-name-column", headers: read.headers };
  }
  if (read.people.length > MAX_PEOPLE_PER_BATCH) {
    return { kind: "too-many-rows", limit: MAX_PEOPLE_PER_BATCH };
  }
  return { kind: "ok", people: read.people };
}
