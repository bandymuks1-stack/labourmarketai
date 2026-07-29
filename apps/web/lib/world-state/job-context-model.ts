/**
 * JOB ENTITY → Context Panel model. PURE (W3).
 *
 * The `job` entity is the one thing a person can select in the workspace today
 * (a company's open demand, from the gated worker board). This module turns the
 * CANONICAL card the marketplace use case already produced into the structural
 * model the Context Panel renders — codes, slugs, counts and booleans only.
 *
 * NO COPY LIVES HERE. Recommendations are emitted as CODES, exactly like
 * `JobRecommendation.topReasonCodes`; the server layer localizes them. That is
 * what keeps this file unit-testable and keeps product copy in the message
 * catalogues where the i18n guards can see it.
 *
 * NOTHING IS COMPUTED THAT THE ENGINE ALREADY COMPUTED. The match, its basis,
 * the missing skills and the worker's next action all arrive decided on the
 * `OpportunityCard`; this module selects and orders, it does not re-derive, and
 * it never produces a score or a percentage.
 *
 * Not to be confused with `lib/opportunities/recommendations-model.ts`, which
 * decides WHICH demands are worth showing. This decides what the panel shows
 * about the ONE demand a person actually selected.
 *
 * Pure. No IO, no React, no translations.
 */

import type { OpportunityCard } from "@/lib/opportunities/load-worker-opportunities";
import type { InterestStatus } from "@/lib/opportunities/interest-snapshot";
import type { WorkerNextAction } from "@/lib/opportunities/opportunity-fit";
import type { MatchResultV1 } from "@/lib/market/match-v1";
import type { StructuredDemandPublic } from "@/lib/opportunities/structured-public";
import { CONTEXT_RECOMMENDATION_LIMIT } from "./entity-context";

/** The route status the worker-facing "verified company" badge keys on. The
 *  SAME real signal the opportunities board uses — never copy, never a guess. */
export const VERIFIED_ROUTE_STATUS = "approved_direct_partner";

/**
 * A next step derived from THIS demand's real facts. A code plus the data the
 * copy needs — so the sentence the user reads can always name its basis.
 */
export type JobContextRecommendationCode =
  /** Required skills the person does not hold yet. The journal is how they
   *  become real, so this points at logging work — never at "apply anyway". */
  | { readonly code: "close_missing_skills"; readonly slugs: readonly string[] }
  /** Interest already expressed and not yet answered — the honest status. */
  | { readonly code: "interest_pending" }
  /**
   * The card's own canonical next action (profile too thin, no skills yet, …).
   * `review_match` is excluded at the TYPE level: reviewing the match is what
   * the open panel already is, so it could only ever be advice to do the thing
   * the person is doing. Excluding it here means no copy exists for it either.
   */
  | {
      readonly code: "next_action";
      readonly action: Exclude<WorkerNextAction, "review_match">;
    };

export interface JobContextModel {
  readonly requestId: string;
  /** Only ever the RPC's safe approved-company column, or null. */
  readonly companyName: string | null;
  /** True only for an admin-verified supply route (real signal, not copy). */
  readonly verifiedRoute: boolean;
  readonly roleSlug: string | null;
  readonly country: string | null;
  readonly locationLabel: string | null;
  readonly startPeriod: string | null;
  readonly teamSize: number | null;
  readonly accommodation: string | null;
  readonly transport: string | null;
  readonly requiredTools: readonly string[];
  /** Canonical taxonomy slugs from the engine's fit basis. */
  readonly matchedSkillSlugs: readonly string[];
  readonly missingSkillSlugs: readonly string[];
  /** The §19 basis counts, or null when the engine had nothing to compare. */
  readonly basis: {
    readonly matched: number;
    readonly total: number;
    readonly confirmed: number;
  } | null;
  readonly matchStatus: MatchResultV1["status"];
  readonly interestStatus: InterestStatus | null;
  readonly saved: boolean;
  readonly nextAction: WorkerNextAction;
  /** Ordered by priority, capped. Empty when the data supports nothing. */
  readonly recommendations: readonly JobContextRecommendationCode[];
  /** Worker-safe structured detail, or null when the projection is absent. */
  readonly structured: StructuredDemandPublic | null;
}

/**
 * Interest states that mean "sent, and the company has not closed the loop".
 * `interested` is the worker's own signal; `reviewed` is the company saying it
 * looked. `contacted` is deliberately NOT here — the loop closed, so telling
 * the person to keep waiting would be wrong. `withdrawn` is their own choice.
 */
const PENDING_INTEREST = new Set(["interested", "reviewed"]);

/** How many missing skills a recommendation may name before it stops being
 *  useful advice and becomes a list. */
export const MAX_NAMED_MISSING_SKILLS = 3;

export function deriveJobContextModel(card: OpportunityCard): JobContextModel {
  const need = card.need;
  const fit = card.match.skillFit;

  const missingSkillSlugs = fit ? [...fit.missingUris] : [];
  const recommendations: JobContextRecommendationCode[] = [];

  // 1. The concrete gap. Naming skills the demand requires and the person does
  //    not hold is the single most actionable thing this panel can say, and it
  //    points at the journal — the platform's own evidence spine — rather than
  //    at a self-declaration.
  if (missingSkillSlugs.length > 0) {
    recommendations.push({
      code: "close_missing_skills",
      slugs: missingSkillSlugs.slice(0, MAX_NAMED_MISSING_SKILLS),
    });
  }

  // 2. An unanswered signal is a real state the person should see, so they do
  //    not send a second one and do not read silence as rejection.
  if (card.interestStatus !== null && PENDING_INTEREST.has(card.interestStatus)) {
    recommendations.push({ code: "interest_pending" });
  }

  // 3. The card's own canonical next action — but only when it says something
  //    the two above did not. `review_match` is what the open panel IS, so
  //    repeating it as advice would be noise.
  const nextAction = card.nextAction;
  if (nextAction !== "review_match" && recommendations.length < CONTEXT_RECOMMENDATION_LIMIT) {
    recommendations.push({ code: "next_action", action: nextAction });
  }

  return {
    requestId: need.id,
    companyName: need.companyName ?? null,
    verifiedRoute: need.routeStatus === VERIFIED_ROUTE_STATUS,
    roleSlug: need.roleText,
    country: need.country,
    locationLabel: need.locationLabel ?? null,
    startPeriod: need.startPeriod,
    teamSize: need.teamSize,
    accommodation: need.accommodation,
    transport: need.transport ?? null,
    requiredTools: need.requiredTools ? [...need.requiredTools] : [],
    matchedSkillSlugs: fit ? [...fit.matchedUris] : [],
    missingSkillSlugs,
    basis: fit
      ? {
          matched: fit.matchedTotal,
          total: fit.needTotal,
          confirmed: fit.matchedConfirmed,
        }
      : null,
    matchStatus: card.match.status,
    interestStatus: card.interestStatus,
    saved: card.saved,
    nextAction: card.nextAction,
    recommendations: recommendations.slice(0, CONTEXT_RECOMMENDATION_LIMIT),
    structured: card.structured,
  };
}
