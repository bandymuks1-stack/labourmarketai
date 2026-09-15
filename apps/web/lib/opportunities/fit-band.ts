/**
 * FIT BAND — the honest name for what the ONE engine said about a worker and
 * a posting, as a surface may group and label it (#1689, defect H).
 *
 * PURE. No IO, no `server-only`, no supabase — importable from server
 * actions, client components and tests alike.
 *
 * WHY THIS EXISTS. On production ("Ieškau naujo darbo", 2026-09-12) the
 * conversation's `opportunities` result listed "Senior AI Engineer" and
 * "Rörmokare" under "Man tinkantys darbai" for a Lithuanian worker. The
 * engine had NOT said those postings fit: it had said `insufficient_data`
 * (an ad whose requirements the recognizer could not read) and `weak`. The
 * projection dropped the status on the way to the panel, and the panel's
 * heading called every row suitable. A found posting is not a suitable one.
 *
 * The band is TOTAL over `MatchStatus` and never invents a verdict:
 *
 *   strong               → `strong`
 *   possible             → `possible`
 *   weak, not eligible   → `conflict`            a hard criterion FAILED
 *        (or a blocking criterion recorded)      (country, language, pay…)
 *   weak, eligible       → `missing_requirement` the worker lacks something
 *                                                the ad asks for; nothing
 *                                                is incompatible
 *   insufficient_data    → `not_assessed`        the engine could not judge —
 *                                                UNKNOWN, never "does not fit"
 *
 * `why` carries the engine's own codes so a surface can say WHY a posting
 * sits in its band, in words, and never has to guess. Empty `why` is a
 * legitimate answer for `strong` / `possible`.
 */

import type {
  MatchGap,
  MatchMissingDataCode,
  MatchResultV1,
  MatchStatus,
} from "@/lib/market/match-v1";
import type { MatchCriterionResult } from "@/lib/market/match-criteria-v2";

export type FitBand =
  | "strong"
  | "possible"
  | "missing_requirement"
  | "conflict"
  | "not_assessed";

/** Listing order for the bands — the engine's strongest-first, with the
 *  UNKNOWN band last because "not assessed" is not a verdict at all. */
export const FIT_BAND_ORDER: readonly FitBand[] = [
  "strong",
  "possible",
  "missing_requirement",
  "conflict",
  "not_assessed",
];

/** A band a person may act on as a fit: the engine SAID the posting fits
 *  (fully or partly). Everything else is shown, explained, never called
 *  suitable. */
export function isAssessedFit(band: FitBand): boolean {
  return band === "strong" || band === "possible";
}

export interface FitBandWhy {
  /** The engine's gap codes (`skills_missing`, `language_missing`, …). */
  readonly gapCodes: readonly MatchGap["code"][];
  /** The engine's missing-data codes — what could NOT be judged. */
  readonly missingDataCodes: readonly MatchMissingDataCode[];
  /** Hard criteria that FAILED (contract v2) — the reason for `conflict`. */
  readonly blockingCriteria: readonly MatchCriterionResult["criterion"][];
}

export interface FitBandReading {
  readonly band: FitBand;
  /** The status the band was derived from — a passthrough, so a surface
   *  can still show the engine's own word beside the band. */
  readonly status: MatchStatus;
  readonly why: FitBandWhy;
}

/** The slice of a match the band needs. `Partial` on purpose: a card that
 *  carries no match at all (a test double, a degraded read) is NOT ASSESSED,
 *  never guessed into a band. */
export type FitBandInput = Partial<
  Pick<MatchResultV1, "status" | "eligible" | "gaps" | "missingData" | "blocking">
>;

const STATUSES: ReadonlySet<string> = new Set<MatchStatus>([
  "strong",
  "possible",
  "weak",
  "insufficient_data",
]);

export function deriveFitBand(match: FitBandInput | null | undefined): FitBandReading {
  const status: MatchStatus =
    match && typeof match.status === "string" && STATUSES.has(match.status)
      ? match.status
      : "insufficient_data";
  const gaps = Array.isArray(match?.gaps) ? match.gaps : [];
  const missingData = Array.isArray(match?.missingData) ? match.missingData : [];
  const blocking = Array.isArray(match?.blocking) ? match.blocking : [];
  const why: FitBandWhy = {
    gapCodes: gaps.map((g) => g.code),
    missingDataCodes: [...missingData],
    blockingCriteria: blocking.map((b) => b.criterion),
  };

  switch (status) {
    case "strong":
      return { band: "strong", status, why };
    case "possible":
      return { band: "possible", status, why };
    case "insufficient_data":
      return { band: "not_assessed", status, why };
    case "weak": {
      // `eligible` is false the moment ANY hard criterion fails (contract v2,
      // guard-tested); a recorded blocking criterion says the same thing. A
      // missing `eligible` (a partial input) is read as eligible — a
      // conflict is only ever claimed on the engine's own word.
      const conflict = match?.eligible === false || blocking.length > 0;
      return { band: conflict ? "conflict" : "missing_requirement", status, why };
    }
  }
}
