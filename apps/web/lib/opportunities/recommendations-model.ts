/**
 * Job Recommendation model (Sprint v2 §4 — jobs as the daily return reason).
 *
 * PURE derivation layer over the canonical PR4 match engine — no DB, no IO,
 * no second engine. The server read layer (./recommendations.ts) feeds it the
 * SAME `OpportunityCard`-shaped rows the worker board already computes
 * (lib/opportunities/load-worker-opportunities.ts: gated RPC rows ×
 * matchWorkerToNeed), plus the worker's own seen markers; this module only
 * decides WHICH of those matches are worth surfacing and in what shape.
 * Every per-navigation worker read behind those rows (the worker row, skill
 * rows and primary profession that build the match subject in
 * ./worker-subject.ts) goes through the request-cached core readers in
 * `@/lib/data/worker-core` — one Supabase round-trip per table per
 * navigation, shared with the player-card and premium-hub consumers.
 *
 * Doctrine compliance:
 *   • §19: every surfaced fit carries its FULL basis (matched/total/confirmed
 *     counts straight from the canonical FitBasis) — a recommendation object
 *     without the basis cannot be constructed. Nothing here is a person
 *     score; every row exists only inside one need's context.
 *   • §18: no fake urgency — "new" is derived from the real created_at window
 *     or a real unseen marker, never invented. When the owner-gated seen
 *     store is absent, unseen-ness is honestly unknowable → newCount is 0
 *     (a notification that could never clear is noise, not a signal).
 *   • Anti-spam (owner mandate "quality first"): only eligible matches with
 *     at least one matched skill are recommendable; a hard-blocked demand
 *     (language, licence, compensation floor…) never becomes a
 *     recommendation, no matter its coverage.
 */

import {
  compareMatches,
  type MatchReason,
  type MatchResultV1,
} from "@/lib/market/match-v1";

/** Near-miss window: a below-"possible" skill coverage still surfaces when
 *  at most this many required skills are missing (the worker can close the
 *  gap; the missing chips tell them exactly how). */
export const NEAR_MISS_MAX_MISSING_SKILLS = 2;

/** "Recently posted" window for the isNew flag (days). */
export const NEW_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The minimal demand facts a recommendation needs — a structural subset of
 *  the board's `OpportunityNeed` (same rows, no copied truth). */
export interface RecommendationSourceNeed {
  readonly id: string;
  /** Work-type slug (closed set) — localized by the UI, never free text. */
  readonly roleText: string | null;
  readonly country: string | null;
  readonly locationLabel?: string | null;
  readonly startPeriod: string | null;
  readonly companyName?: string | null;
  readonly createdAt?: string | null;
}

export interface RecommendationSource {
  readonly need: RecommendationSourceNeed;
  readonly match: MatchResultV1;
}

/** The worker's own seen markers (worker_opportunity_seen). `available` is
 *  false until the owner-gated migration is applied — unseen-ness is then
 *  honestly unknowable. */
export interface SeenState {
  readonly available: boolean;
  readonly seenIds: ReadonlySet<string>;
}

/** §19 basis — carried WHOLE on every recommendation (pct never travels
 *  without its counts). */
export interface RecommendationBasis {
  readonly pct: number;
  readonly matchedTotal: number;
  readonly needTotal: number;
  readonly matchedConfirmed: number;
}

export type SalaryOutcome = "within" | "negotiable" | "unknown";

export interface JobRecommendation {
  readonly requestId: string;
  readonly roleSlug: string | null;
  readonly country: string | null;
  readonly locationLabel: string | null;
  readonly startPeriod: string | null;
  readonly companyName: string | null;
  readonly status: MatchResultV1["status"];
  /** §19 contextual basis — always complete, never a bare %. */
  readonly basis: RecommendationBasis;
  /** Top positive reasons (codes; UI localizes). skill_fit is excluded —
   *  the basis line already IS that reason. */
  readonly topReasonCodes: readonly MatchReason["code"][];
  readonly salary: SalaryOutcome;
  /** Canonical skill slugs — required and held / required but missing. */
  readonly matchedSkillSlugs: readonly string[];
  readonly missingSkillSlugs: readonly string[];
  /** Never rendered to this worker before (seen store applied + no marker). */
  readonly unseen: boolean;
  /** Posted within the last 7 days OR unseen (spec: created recently OR not
   *  yet seen). With the seen store absent this falls back to recency only. */
  readonly isNew: boolean;
  /** Posted within the last NEW_WINDOW_DAYS — a market fact independent of
   *  the seen store ("appeared this week" ≠ "new for you"). */
  readonly recentlyCreated: boolean;
}

/**
 * Quality gate: eligible (no failed hard criterion), a real skill basis with
 * at least one matched skill, and either an honest "possible"/"strong" band
 * or a near-miss (≤ NEAR_MISS_MAX_MISSING_SKILLS skills missing).
 */
export function isRecommendable(match: MatchResultV1): boolean {
  if (!match.eligible) return false;
  const fit = match.skillFit;
  if (fit === null || fit.matchedTotal === 0) return false;
  if (match.status === "strong" || match.status === "possible") return true;
  return fit.missingUris.length <= NEAR_MISS_MAX_MISSING_SKILLS;
}

/** Salary comparison outcome from the SAME engine result (compareCompensationV2
 *  / legacy pay ceiling) — never recomputed here. */
export function salaryOutcome(match: MatchResultV1): SalaryOutcome {
  if (match.reasons.some((r) => r.code === "pay_within_offer")) return "within";
  if (
    match.matchedHard.some(
      (c) => c.criterion === "compensation" && c.outcome === "met",
    )
  ) {
    return "within";
  }
  if (match.negotiables.some((c) => c.criterion === "compensation")) {
    return "negotiable";
  }
  return "unknown";
}

/**
 * Derive the full ordered recommendation list. Stable: sources with equal
 * ranking keep their input order (the loader already orders by the shared
 * §19 comparator, and Array.prototype.sort is stable), so the same inputs
 * always render the same list.
 */
export function deriveJobRecommendations(
  sources: readonly RecommendationSource[],
  seen: SeenState,
  nowMs: number,
): readonly JobRecommendation[] {
  return sources
    .filter((s) => isRecommendable(s.match))
    .sort((a, b) => compareMatches(a.match, b.match))
    .map((s) => {
      const fit = s.match.skillFit!;
      const createdMs = s.need.createdAt ? Date.parse(s.need.createdAt) : NaN;
      const recentlyCreated =
        Number.isFinite(createdMs) && nowMs - createdMs <= NEW_WINDOW_DAYS * DAY_MS;
      const unseen = seen.available && !seen.seenIds.has(s.need.id);
      return {
        requestId: s.need.id,
        roleSlug: s.need.roleText,
        country: s.need.country,
        locationLabel: s.need.locationLabel ?? null,
        startPeriod: s.need.startPeriod,
        companyName: s.need.companyName ?? null,
        status: s.match.status,
        basis: {
          pct: fit.pct,
          matchedTotal: fit.matchedTotal,
          needTotal: fit.needTotal,
          matchedConfirmed: fit.matchedConfirmed,
        },
        topReasonCodes: s.match.reasons
          .filter((r) => r.code !== "skill_fit")
          .slice(0, 3)
          .map((r) => r.code),
        salary: salaryOutcome(s.match),
        matchedSkillSlugs: fit.matchedUris,
        missingSkillSlugs: fit.missingUris,
        unseen,
        isNew: recentlyCreated || unseen,
        recentlyCreated,
      };
    });
}

/** The aggregate "new matching jobs" count for the notification spine — the
 *  worker's UNSEEN recommendations only. 0 while the seen store is absent
 *  (a count that could never clear by visiting is not a signal). */
export function countUnseenRecommendations(
  recommendations: readonly JobRecommendation[],
): number {
  return recommendations.filter((r) => r.unseen).length;
}

/** A deterministic journal↔job connection: the recommendation's matched or
 *  missing skill set intersected with the skills the worker's RECENT journal
 *  entries support (journal_entry_skills links). Matched connections come
 *  first (they exist in practice — links point at declared skills), missing
 *  ones are kept for completeness; order inside each group follows the
 *  basis arrays (already sorted), so the output is stable. */
export interface JournalJobConnection {
  readonly slug: string;
  readonly kind: "matched" | "missing";
}

export function journalConnections(
  recommendation: Pick<JobRecommendation, "matchedSkillSlugs" | "missingSkillSlugs">,
  recentJournalSkillSlugs: ReadonlySet<string>,
): readonly JournalJobConnection[] {
  const matched = recommendation.matchedSkillSlugs
    .filter((slug) => recentJournalSkillSlugs.has(slug))
    .map((slug) => ({ slug, kind: "matched" as const }));
  const missing = recommendation.missingSkillSlugs
    .filter((slug) => recentJournalSkillSlugs.has(slug))
    .map((slug) => ({ slug, kind: "missing" as const }));
  return [...matched, ...missing];
}
