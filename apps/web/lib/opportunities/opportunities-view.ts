/**
 * OPPORTUNITIES VIEW — the pure grouping and labelling behind the PASAULIS
 * destination (`/dashboard/opportunities`) and the conversation's short
 * readback (#1689, defect H: a found posting is not a suitable one).
 *
 * PURE. No IO, no `server-only`, no supabase, no i18n — importable from the
 * server page, the client result and tests alike.
 *
 * WHAT IT DECIDES, AND WHAT IT NEVER DECIDES. Every row that reaches this
 * module already carries the band the ONE engine's verdict implies
 * (`deriveFitBand`). This module only:
 *
 *   - orders rows into band sections (strongest first, UNKNOWN last) and
 *     drops empty sections;
 *   - reads the STRONG band honestly when it is empty — naming ONLY the
 *     subject-side facts the engine itself reported missing, never a guess
 *     about what would help;
 *   - picks the readback rows a chat answer may show (assessed fits only);
 *   - tells a reader failure ("could not read") apart from an empty answer.
 *
 * It never re-scores, never re-ranks inside a band (the shared comparator
 * already did), never promotes a `not_assessed` row into a fit, and never
 * turns UNKNOWN into ZERO.
 */

import {
  FIT_BAND_ORDER,
  deriveFitBand,
  isAssessedFit,
  type FitBand,
} from "./fit-band";
import type { MatchMissingDataCode, MatchStatus } from "@/lib/market/match-v1";

/**
 * The subject facts the ONE engine compared against — a projection of the
 * existing subject reader (`buildOwnWorkerContext`), so the destination can
 * state in words WHAT the fit was assessed against. Every field is "as
 * stated": `null` / empty means the person has not stated it, never a
 * default the surface may fill in.
 */
export interface AssessedAgainstFacts {
  /** Distinct skills the engine ran on (the subject's skill set). */
  readonly skillCount: number;
  /** Language codes the subject stated. Empty = not stated. */
  readonly languages: readonly string[];
  /** Expected minimum pay in EUR, as the worker stated it. */
  readonly salaryMinEur: number | null;
  /** The city the worker is in / prefers, when stated. */
  readonly city: string | null;
}

export interface BandedRow {
  readonly band: FitBand;
}

export interface WhyCodes {
  readonly gapCodes: readonly string[];
  readonly missingDataCodes: readonly MatchMissingDataCode[];
  /** Profile-completeness gaps (`OpportunityGap`) — platform rows only. */
  readonly profileGapCodes?: readonly string[];
}

export interface BandSection<T extends BandedRow> {
  readonly band: FitBand;
  readonly rows: readonly T[];
}

/** Rows → sections in `FIT_BAND_ORDER`; a section exists only when it has
 *  rows. Order INSIDE a section is the input order — the caller's
 *  comparator order — untouched. */
export function groupRowsByBand<T extends BandedRow>(
  rows: readonly T[],
): readonly BandSection<T>[] {
  return FIT_BAND_ORDER.map((band) => ({
    band,
    rows: rows.filter((r) => r.band === band),
  })).filter((s) => s.rows.length > 0);
}

export type BandCounts = Readonly<Record<FitBand, number>>;

export function countByBand(rows: readonly BandedRow[]): BandCounts {
  const counts: Record<FitBand, number> = {
    strong: 0,
    possible: 0,
    missing_requirement: 0,
    conflict: 0,
    not_assessed: 0,
  };
  for (const r of rows) counts[r.band] += 1;
  return counts;
}

/** The bands that hold at least one row, in band order — what a sentence
 *  lists; zero bands are not said. */
export function nonEmptyBands(counts: BandCounts): readonly FitBand[] {
  const out: FitBand[] = [];
  for (const band of FIT_BAND_ORDER) if (counts[band] > 0) out.push(band);
  return out;
}

/** Nothing the engine assessed as a fit — discovery only. False for an
 *  empty list: "nothing found" is not "found but unassessed". */
export function isDiscoveryOnly(rows: readonly BandedRow[]): boolean {
  return rows.length > 0 && rows.every((r) => !isAssessedFit(r.band));
}

/**
 * The rows a chat READBACK may show: STRONG first, then POSSIBLE, at most
 * `max`. Never any other band — a readback that listed a `not_assessed` row
 * under an answer to "find me work" is the production defect itself.
 */
export function selectReadbackRows<T extends BandedRow>(
  rows: readonly T[],
  max = 3,
): readonly T[] {
  const strong = rows.filter((r) => r.band === "strong");
  const possible = rows.filter((r) => r.band === "possible");
  return [...strong, ...possible].slice(0, Math.max(0, max));
}

/**
 * A platform recommendation crosses the result boundary with its engine
 * status only. The band is the same derivation the external rows get —
 * `weak` without a recorded hard failure is MISSING REQUIREMENT, a conflict
 * is only ever claimed on the engine's own word (see `deriveFitBand`).
 */
export function bandOfStatus(status: MatchStatus | null | undefined): FitBand {
  return deriveFitBand(status ? { status } : null).band;
}

/**
 * Missing-data codes the PERSON can act on. The demand-side codes
 * (`need_not_structured`, `need_recognized_not_confirmed`,
 * `language_requirement_unknown`) describe the advertisement, not the
 * profile — listing them as "what would change it" would send the person to
 * fix something that is not theirs.
 */
export const SUBJECT_SIDE_MISSING_DATA: readonly MatchMissingDataCode[] = [
  "no_subject_skills",
  "location_unknown",
  "pay_unknown",
  "language_unknown",
  "availability_unknown",
];

export type StrongBandReading =
  /** At least one row the engine assessed as strong. */
  | { readonly kind: "rows"; readonly count: number }
  /** Rows exist, none strong. `subjectMissing` = the subject-side codes the
   *  engine reported across the shown rows — what would change it, in the
   *  engine's own words. Empty when the engine reported nothing missing on
   *  the person's side: then there is honestly nothing to name. */
  | { readonly kind: "empty"; readonly subjectMissing: readonly MatchMissingDataCode[] }
  /** No rows at all — an empty answer, not an empty band. */
  | { readonly kind: "nothing_retrieved" };

export function readStrongBand(
  rows: readonly (BandedRow & Pick<WhyCodes, "missingDataCodes">)[],
): StrongBandReading {
  if (rows.length === 0) return { kind: "nothing_retrieved" };
  const count = rows.filter((r) => r.band === "strong").length;
  if (count > 0) return { kind: "rows", count };
  const seen = new Set<MatchMissingDataCode>();
  for (const r of rows) for (const c of r.missingDataCodes) seen.add(c);
  return {
    kind: "empty",
    subjectMissing: SUBJECT_SIDE_MISSING_DATA.filter((c) => seen.has(c)),
  };
}

/** The codes a row's WHY line is built from: engine gaps, then what the
 *  engine could not judge, then profile-completeness gaps — de-duplicated,
 *  order kept. Resolution to words happens in the surface (`t.has`), so a
 *  code without copy is DROPPED there, never shown raw. */
export function whyCodesFor(row: WhyCodes): readonly string[] {
  const out: string[] = [];
  for (const c of [
    ...row.gapCodes,
    ...row.missingDataCodes,
    ...(row.profileGapCodes ?? []),
  ]) {
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

export interface RetrievalCounts {
  readonly retrieved: number;
  readonly shown: number;
  /** Retrieved but not shown — the compressed first view's remainder. */
  readonly withheld: number;
}

export function retrievalCounts(retrieved: number, shown: number): RetrievalCounts {
  const r = Math.max(0, retrieved);
  const s = Math.min(Math.max(0, shown), r);
  return { retrieved: r, shown: s, withheld: r - s };
}

/**
 * The destination's reading of what it holds. `could_not_read_subject` is a
 * READER FAILURE (no worker row — nothing to compare against) and is kept
 * apart from every row-bearing state: UNKNOWN ≠ ZERO, so a failed read is
 * never rendered as an empty STRONG band.
 */
export type WorldReading<T extends BandedRow & Pick<WhyCodes, "missingDataCodes">> =
  | { readonly kind: "could_not_read_subject" }
  | {
      readonly kind: "bands";
      readonly sections: readonly BandSection<T>[];
      readonly strong: StrongBandReading;
      readonly counts: BandCounts;
      readonly discoveryOnly: boolean;
    };

export function deriveWorldReading<
  T extends BandedRow & Pick<WhyCodes, "missingDataCodes">,
>(input: {
  readonly subject: "ready" | "unreadable";
  readonly rows: readonly T[];
}): WorldReading<T> {
  if (input.subject === "unreadable") return { kind: "could_not_read_subject" };
  return {
    kind: "bands",
    sections: groupRowsByBand(input.rows),
    strong: readStrongBand(input.rows),
    counts: countByBand(input.rows),
    discoveryOnly: isDiscoveryOnly(input.rows),
  };
}
