import "server-only";

import { cache } from "react";

import { getWorkerJobRecommendations } from "@/lib/opportunities/recommendations";

/**
 * The profile's opportunity signal (W5 Slice 1).
 *
 * Answers, for the person looking at their own profile: **how many currently
 * visible opportunities match me, and why does the closest one match?**
 *
 * ── WHY THIS IS NOT A SCORE (§19) ────────────────────────────────────────
 * Doctrine §19(a) forbids any global person score by name — `overall_score`,
 * `person_score`, `worker_rating`, `trust_score`, `profile_strength`, OVR. This
 * module produces none of them and must never grow one.
 *
 * What it produces is the permitted form under §19(b): a COUNT of real rows,
 * and a per-opportunity basis ("matches 2 of 4 required skills, 0 confirmed")
 * that is always tied to ONE concrete need and always carries its counts. The
 * number describes the MARKET's current state relative to a profile — it is
 * not a rating of the person, and it changes when demand changes, not when the
 * person is judged.
 *
 * ── NO SECOND PIPELINE ───────────────────────────────────────────────────
 * Everything comes from `getWorkerJobRecommendations` — the same request-cached
 * use case the board, the conversation and the dashboard card read. This module
 * loads nothing, ranks nothing and computes no fit of its own.
 *
 * `null` outcomes are first-class: an unavailable board is reported as
 * unavailable, never as "0 matches", which would be a claim about the market
 * that was never measured.
 */

export interface ProfileOpportunitySignal {
  /**
   * How many currently visible opportunities are recommendable for this
   * profile. `null` = not measured (no worker profile, or the gated board RPC
   * is unavailable) — never silently 0.
   */
  readonly matchingCount: number | null;
  /** Why the board could not answer, when it could not. */
  readonly unavailableReason: "no-worker" | "board-unavailable" | null;
  /**
   * The closest current match, with the counts that justify it. Null when
   * there is none. Deliberately the ENGINE's own basis numbers — this module
   * does not recompute or round them.
   */
  readonly closest: {
    /** Real demand id, so the caller can open the real opportunity. */
    readonly requestId: string;
    /** Approved company name, or null — never an invented employer. */
    readonly companyName: string | null;
    readonly roleSlug: string | null;
    /** §19 basis, carried whole: matched / total / confirmed. */
    readonly matchedSkills: number;
    readonly requiredSkills: number;
    readonly confirmedSkills: number;
    /** Canonical skill slugs that matched — the concrete overlap. */
    readonly matchedSkillSlugs: readonly string[];
  } | null;
}

export const getProfileOpportunitySignal = cache(
  async (): Promise<ProfileOpportunitySignal> => {
    const result = await getWorkerJobRecommendations({ limit: 1 });
    if (result.kind !== "ready") {
      return { matchingCount: null, unavailableReason: "no-worker", closest: null };
    }
    if (!result.boardAvailable) {
      // Without the gated visibility RPC there is no demand data at all, so a
      // count would be a statement about a market we did not read.
      return { matchingCount: null, unavailableReason: "board-unavailable", closest: null };
    }

    const top = result.recommendations[0] ?? null;
    return {
      matchingCount: result.totalRecommendable,
      unavailableReason: null,
      closest: top
        ? {
            requestId: top.requestId,
            companyName: top.companyName,
            roleSlug: top.roleSlug,
            matchedSkills: top.basis.matchedTotal,
            requiredSkills: top.basis.needTotal,
            confirmedSkills: top.basis.matchedConfirmed,
            matchedSkillSlugs: top.matchedSkillSlugs,
          }
        : null,
    };
  },
);
