import { csvSafeCell } from "@/lib/projects/operations-report";

import type { InstitutionLearnerOutcomes } from "./institution-outcomes";
import type { ProgramRow } from "./programs";

/**
 * INSTITUTION REPORT — the export half of `J-INSTITUTION-OUTCOME`'s last
 * link. PURE, DB-free.
 *
 * The link stayed BROKEN for one narrow reason after 2026-09-08: an
 * institution could SEE employer demand per programme and SEE its learner
 * outcomes on screen, and could take neither anywhere. This builder is that
 * "anywhere" and nothing more — it READS NOTHING. It serialises the two
 * reads the `/dashboard/company` institution surfaces already perform
 * (`readInstitutionPrograms`, `readInstitutionLearnerOutcomes`), so the file
 * can never disagree with the screen and no second demand or outcome model
 * is born.
 *
 * THE HONESTY RULES IT ENCODES — each one is a separation that has collapsed
 * in this product before:
 *
 * · SEP-7 (UNKNOWN ≠ ZERO). `demandCount === null` prints `unknown`, never
 *   `0`. Null means one of two honest things — the programme points at no
 *   work direction, or the canonical per-profession count does not carry
 *   that profession — and neither is "there is no demand". A `0` in a
 *   spreadsheet is a number an institution would plan against.
 * · The k-anonymity floor travels WITH the data. Below the floor the four
 *   outcome counts are null by construction in the SQL function; they print
 *   `suppressed`, never `0` and never blank, so a reader of the file cannot
 *   mistake a privacy floor for a measured zero.
 * · An unavailable outcomes read is stated as its reason, not omitted. A
 *   missing block reads as "no outcomes"; a stated `unavailable` does not.
 * · A programme NAME is text one manager typed and another manager opens in a
 *   spreadsheet, so cells go through `csvSafeCell`: a value starting `=`, `+`,
 *   `-`, `@`, tab or CR is prefixed with an apostrophe. RFC-4180 quoting alone
 *   does not stop this — Excel and Sheets strip the quotes and then evaluate
 *   what is inside, which is how a downloaded report runs a formula.
 * · Column names describe what the number IS. `active_public_vacancies` is a
 *   market count over the public vacancy pool, not a promise of places; and
 *   `active_learners` counts cohort membership, not achievement.
 *
 * NO PERSON APPEARS IN THIS FILE. The programme block carries counts of
 * learners, never their ids or labels, and the outcomes block is an
 * aggregate by construction. The export therefore discloses nothing the
 * institution could not already read, which is what keeps it GREEN.
 */

/** The two blocks are separated by one blank line; each carries its own header. */
export const PROGRAM_CSV_HEADER = [
  "program_name",
  "direction_profession",
  "education_type",
  "cohorts",
  "active_learners",
  "active_public_vacancies",
] as const;

export const OUTCOMES_CSV_HEADER = ["metric", "value"] as const;

/** Printed wherever a count is genuinely not known (SEP-7). Never `0`. */
export const UNKNOWN_CELL = "unknown";
/** Printed where the k-anonymity floor nulled a count. Never `0`. */
export const SUPPRESSED_CELL = "suppressed";

export type OutcomesForReport =
  | { readonly status: "ok"; readonly outcomes: InstitutionLearnerOutcomes }
  | { readonly status: "unavailable"; readonly reason: string };

function csvRow(cells: readonly string[]): string {
  return cells.map(csvSafeCell).join(",");
}

/** Active cohort members across a programme's cohorts, counted once per person. */
export function activeLearnerCount(program: ProgramRow): number {
  const ids = new Set<string>();
  for (const cohort of program.cohorts) {
    for (const member of cohort.members) {
      if (member.status === "active") ids.add(member.profileId);
    }
  }
  return ids.size;
}

function programCells(program: ProgramRow): readonly string[] {
  return [
    program.name,
    program.targetProfessionSlug ?? "",
    program.educationTypeSlug ?? "",
    String(program.cohorts.length),
    String(activeLearnerCount(program)),
    program.demandCount === null ? UNKNOWN_CELL : String(program.demandCount),
  ];
}

function outcomeCount(value: number | null, suppressed: boolean): string {
  if (value !== null) return String(value);
  return suppressed ? SUPPRESSED_CELL : UNKNOWN_CELL;
}

function outcomesRows(outcomes: OutcomesForReport): readonly (readonly string[])[] {
  if (outcomes.status === "unavailable") {
    return [["status", `unavailable_${outcomes.reason}`]];
  }
  const o = outcomes.outcomes;
  return [
    ["status", o.suppressed ? "suppressed_below_floor" : "ok"],
    ["learners_connected", String(o.learnersConnected)],
    ["active_last_30d", outcomeCount(o.activeLast30d, o.suppressed)],
    ["with_interest_signals", outcomeCount(o.withInterestSignals, o.suppressed)],
    ["with_accepted_bookings", outcomeCount(o.withAcceptedBookings, o.suppressed)],
    ["with_active_engagements", outcomeCount(o.withActiveEngagements, o.suppressed)],
    ["computed_at", o.computedAt],
  ];
}

/**
 * Build the institution report CSV: the programme table, one blank line, the
 * institution-level outcomes as metric/value pairs.
 *
 * The outcomes are deliberately NOT folded into the programme rows. They are
 * an aggregate over the institution's active `student` contexts, not a
 * per-programme attribution, and repeating them on every programme row would
 * invent an attribution the data does not carry.
 */
export function buildInstitutionReportCsv(
  programs: readonly ProgramRow[],
  outcomes: OutcomesForReport,
): string {
  const lines: string[] = [];
  lines.push(csvRow(PROGRAM_CSV_HEADER));
  for (const program of programs) lines.push(csvRow(programCells(program)));
  lines.push("");
  lines.push(csvRow(OUTCOMES_CSV_HEADER));
  for (const row of outcomesRows(outcomes)) lines.push(csvRow(row));
  return lines.join("\r\n") + "\r\n";
}

/** Filesystem-safe filename, stamped with the export day. */
export function institutionReportCsvFilename(isoDay: string): string {
  return `institution-report-${isoDay}.csv`;
}
