/**
 * VACANCY → MatchNeed — matching compatibility.
 *
 * This is the whole reason the import pipeline exists: an imported vacancy
 * has to be matchable by the SAME engine that matches a platform demand, or
 * it is just a job board bolted onto the side of the product.
 *
 * It is the exact sibling of lib/market/need-from-request.ts (canonical
 * customer_requests row → MatchNeed). Same output contract, same rules, no
 * second matching input path and no second engine:
 *
 *     customer_requests row ──buildNeedFromRequestRow──┐
 *                                                      ├─► MatchNeed ─► match-v1
 *     PublicVacancyV1 ────────buildNeedFromVacancy─────┘
 *
 * HONESTY RULES, enforced by construction:
 *   - `needSource` carries the derivation tier, so a recognized-from-text
 *     requirement set can never be presented as human-structured.
 *   - No `payOfferedEurMax` is emitted unless the publisher stated the salary
 *     IN EUR. A SEK figure is not converted: this pipeline has no FX rate and
 *     inventing one would silently corrupt every pay comparison.
 *   - No `structuredV2`: an external ad has no platform structured cluster,
 *     and fabricating one would light up contract-v2 criteria that nobody
 *     stated. Absence is what makes the engine report them as missing facts.
 *   - Coordinates ride through ONLY when the publisher supplied them, and
 *     `radiusKm` stays null because no radius was ever stated.
 *
 * Pure module: no IO, no env, no fetch.
 */
import type { MatchNeed } from "@/lib/market/match-v1";
import type { NeedSkillSource } from "@/lib/market/need-skills";
import type { PublicVacancyV1 } from "./vacancy-contract";

export interface VacancyNeedResult {
  readonly need: MatchNeed;
  /** The derivation tier behind `need.skillIds`, or null when unstructured. */
  readonly source: NeedSkillSource | null;
  /** Facts a platform demand would carry that this ad simply does not. The
   *  caller shows these as gaps rather than letting the engine silently score
   *  as if they were satisfied. */
  readonly missingForMatching: readonly VacancyMatchingGap[];
}

export type VacancyMatchingGap =
  | "no_requirement_set"
  | "no_profession"
  | "no_country"
  | "no_city"
  | "no_start_date"
  | "no_language_requirement"
  | "pay_not_comparable";

/** The one currency the platform's pay comparison is denominated in. */
const PLATFORM_PAY_CURRENCY = "EUR";

/**
 * Canonical vacancy → MatchNeed. `skillSource` is passed separately because
 * it belongs to the categorization stage, not to the stored record: a record
 * re-categorized by a newer recognizer keeps its identity (and its hash) but
 * may legitimately change tier.
 */
export function buildNeedFromVacancy(
  vacancy: PublicVacancyV1,
  skillSource: NeedSkillSource | null,
): VacancyNeedResult {
  const gaps: VacancyMatchingGap[] = [];

  if (vacancy.skillSlugs.length === 0) gaps.push("no_requirement_set");
  if (vacancy.professionSlug === null) gaps.push("no_profession");
  if (!vacancy.location.country) gaps.push("no_country");
  if (!vacancy.location.city) gaps.push("no_city");
  if (vacancy.startDate === null) gaps.push("no_start_date");
  if (vacancy.requiredLanguages.length === 0) {
    gaps.push("no_language_requirement");
  }

  // Pay is comparable ONLY when the publisher quoted EUR. Anything else — a
  // SEK range, a "competitive salary" sentence, or nothing at all — is an
  // honest gap, never a converted or estimated number.
  const payComparable =
    vacancy.compensation.currency === PLATFORM_PAY_CURRENCY &&
    typeof vacancy.compensation.max === "number";
  if (!payComparable) gaps.push("pay_not_comparable");

  const need: MatchNeed = {
    skillIds: vacancy.skillSlugs,
    // An external ad never carries platform ESCO URIs; the field stays empty
    // rather than absent so the shape matches the request-row builder exactly.
    escoSkillUris: [],
    needSource: skillSource,
    professionSlug: vacancy.professionSlug,
    country: vacancy.location.country || null,
    city: vacancy.location.city,
    lat: vacancy.location.lat,
    lng: vacancy.location.lng,
    // Never stated by a public vacancy feed — leaving it null keeps the
    // distance check data-gated instead of silently bounding it.
    radiusKm: null,
    languages:
      vacancy.requiredLanguages.length > 0
        ? vacancy.requiredLanguages
        : undefined,
    payOfferedEurMax: payComparable ? vacancy.compensation.max : null,
    // A public ad does not state accommodation in a structured field. null is
    // "not stated", which the engine reports as a missing fact.
    accommodationProvided: null,
    startDate: vacancy.startDate,
    structuredV2: null,
  };

  return { need, source: skillSource, missingForMatching: gaps };
}
