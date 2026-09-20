import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildOwnWorkerContext } from "@/lib/opportunities/worker-subject";
import { listMyInterestSignals } from "@/lib/opportunities/interest";
import { listMyHandoffsByVacancy, type MyHandoffRow } from "@/lib/opportunities/vacancy-interest";
import type { InterestStatus } from "@/lib/opportunities/interest-snapshot";
import { buildNeedFromVacancy, type VacancyMatchingGap } from "@/lib/vacancy-sources/vacancy-need";
import { toCanonicalOpportunityView } from "@/lib/vacancy-sources/vacancy-presentation";
import {
  compareMatches,
  matchWorkerToNeed,
  type MatchResultV1,
  type MatchSubject,
} from "@/lib/market/match-v1";
import { deriveFitBand, FIT_BAND_ORDER, isAssessedFit, type FitBand } from "@/lib/opportunities/fit-band";
import { whyCodesFor } from "@/lib/opportunities/opportunities-view";
import {
  searchPublicVacancies,
  type StoredPublicVacancyV1,
} from "@/lib/vacancy-store/vacancy-read";

/**
 * ONE PUBLIC JOB, READ AGAINST ONE PERSON — the member half of
 * `/[locale]/jobs/[id]` (acquisition loop P0, 2026-09-20).
 *
 * The public job page used to unlock the advertisement and stop: employer,
 * location, the publisher's text, an outbound apply link. A person who had
 * just registered for THIS job was then sent to the board to find out
 * whether it fitted them. This module composes, for the job the person is
 * looking at, exactly what the board already computes for every row:
 *
 *   subject   `buildOwnWorkerContext`        — the person's own facts
 *   need      `buildNeedFromVacancy`         — the ad's stated facts + its
 *                                              honest gaps
 *   verdict   `matchWorkerToNeed`            — the ONE engine (v2.2)
 *   band      `deriveFitBand`                — strong / possible /
 *                                              missing_requirement / conflict /
 *                                              not_assessed
 *   why       `whyCodesFor`                  — the engine's own codes
 *   interest  `listMyInterestSignals` +      — the existing "I want this job"
 *             `listMyHandoffsByVacancy`        state for this ad
 *   others    `searchPublicVacancies`        — other live ads of the SAME
 *                                              profession, judged by the same
 *                                              engine, so a non-fit is never
 *                                              the end of the conversation
 *
 * Nothing here is a second engine, a second interest path or a score. Every
 * verdict is the engine's categorical result; UNKNOWN stays UNKNOWN (a
 * `missingFacts` row), a failed hard criterion is `blocking`, and an ad the
 * recogniser could not read is `not_assessed`, never "no fit".
 *
 * Scale: bounded reads only — the person's own rows, and ONE indexed
 * profession query capped at `ALTERNATIVES_POOL` rows.
 */

/** How many other ads of the same profession are read before ranking. */
export const ALTERNATIVES_POOL = 12;
/** How many are offered. */
export const ALTERNATIVES_SHOWN = 3;

export interface PublicJobAlternative {
  readonly vacancyId: string;
  readonly title: string;
  readonly employerName: string | null;
  readonly city: string | null;
  readonly country: string | null;
  readonly publishedAt: string;
  /** The publisher's language for THIS ad (WCAG 3.1.2 on its title). */
  readonly sourceLanguage: string | null;
  readonly band: FitBand;
  /** True when this ad's band is STRONGER than the one being read — the
   *  only sense in which the page may say "closer". Coverage, not opinion. */
  readonly closerThanCurrent: boolean;
}

export interface PublicJobInterestState {
  readonly status: InterestStatus | null;
  readonly handoff: MyHandoffRow | null;
}

export type PublicJobReading =
  /** Signed in, but no worker row of their own — nothing to compare against. */
  | { readonly kind: "no_worker" }
  | {
      readonly kind: "ready";
      readonly workerId: string;
      /** The board's own matchability gate: a declared profession AND at
       *  least one skill row. False = the engine can only say "not assessed"
       *  and the honest next step is the profile, not this ad. */
      readonly matchable: boolean;
      readonly match: MatchResultV1;
      readonly band: FitBand;
      readonly whyCodes: readonly string[];
      /** Facts the ADVERTISEMENT does not state (ad-side unknowns). */
      readonly adGaps: readonly VacancyMatchingGap[];
      /** Whether the existing interest store admits a vacancy source. */
      readonly interestAvailable: boolean;
      readonly interest: PublicJobInterestState;
      readonly alternatives: readonly PublicJobAlternative[];
    };

function bandRank(band: FitBand): number {
  return FIT_BAND_ORDER.indexOf(band);
}

function matchOne(vacancy: StoredPublicVacancyV1, subject: MatchSubject) {
  const skillSource = vacancy.skillSlugs.length > 0 ? "recognized_from_text" : null;
  const { need, missingForMatching } = buildNeedFromVacancy(vacancy, skillSource);
  return { match: matchWorkerToNeed(need, subject), adGaps: missingForMatching };
}

/**
 * Other live advertisements of the same profession, judged by the same
 * engine, strongest first. A failed or unprovisioned read is an EMPTY list —
 * the job page stands on the ad it has.
 */
export async function readSameProfessionAlternatives(
  client: Pick<SupabaseClient, "from">,
  current: StoredPublicVacancyV1,
  subject: MatchSubject,
  currentBand: FitBand,
  nowIso: string,
): Promise<readonly PublicJobAlternative[]> {
  if (!current.professionSlug) return [];
  let vacancies: readonly StoredPublicVacancyV1[] = [];
  try {
    const r = await searchPublicVacancies(client, {
      professionSlug: current.professionSlug,
      limit: ALTERNATIVES_POOL,
      nowIso,
    });
    if (r.status !== "ok") return [];
    vacancies = r.vacancies;
  } catch {
    return [];
  }
  const currentKey = `${current.providerKey}:${current.externalId}`;
  return vacancies
    .filter((v) => v.storeId && v.storeId !== current.storeId)
    .filter((v) => `${v.providerKey}:${v.externalId}` !== currentKey)
    .map((v) => ({ v, ...matchOne(v, subject) }))
    .sort((a, b) => compareMatches(a.match, b.match))
    .slice(0, ALTERNATIVES_SHOWN)
    .map(({ v, match }) => {
      const band = deriveFitBand(match).band;
      const view = toCanonicalOpportunityView(v);
      return {
        vacancyId: v.storeId as string,
        title: view.title,
        employerName: view.employerName,
        city: view.city,
        country: view.country,
        publishedAt: view.publishedAt,
        sourceLanguage: v.sourceLanguage ?? null,
        band,
        closerThanCurrent: bandRank(band) < bandRank(currentBand),
      };
    });
}

export async function readPublicJobForMember(
  supabase: SupabaseClient,
  userId: string,
  vacancy: StoredPublicVacancyV1,
  nowIso: string = new Date().toISOString(),
): Promise<PublicJobReading> {
  const ctx = await buildOwnWorkerContext(supabase, userId);
  if (!ctx) return { kind: "no_worker" };

  const { match, adGaps } = matchOne(vacancy, ctx.subject);
  const band = deriveFitBand(match).band;
  const whyCodes = whyCodesFor({
    gapCodes: match.gaps.map((g) => g.code),
    missingDataCodes: match.missingData,
  });
  const matchable = Boolean(ctx.subject.professionSlug) && ctx.skillRowCount > 0;

  const [signals, handoffs, alternatives] = await Promise.all([
    listMyInterestSignals(supabase, ctx.workerId),
    listMyHandoffsByVacancy(supabase, ctx.workerId),
    // Alternatives are offered only beside a verdict that is not a full fit:
    // a STRONG reading needs no "instead, look at" — the person should act.
    isAssessedFit(band) && band === "strong"
      ? Promise.resolve([] as readonly PublicJobAlternative[])
      : readSameProfessionAlternatives(supabase, vacancy, ctx.subject, band, nowIso),
  ]);

  const vacancyId = vacancy.storeId;
  return {
    kind: "ready",
    workerId: ctx.workerId,
    matchable,
    match,
    band,
    whyCodes,
    adGaps,
    interestAvailable: signals.vacancyInterestAvailable,
    interest: {
      status: vacancyId ? (signals.byVacancy.get(vacancyId) ?? null) : null,
      handoff: vacancyId ? (handoffs.get(vacancyId) ?? null) : null,
    },
    alternatives,
  };
}
