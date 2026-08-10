import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { loadWorkerOpportunities, type OpportunityCard } from "./load-worker-opportunities";
import type {
  ExternalOpportunityCardV1,
  ExternalVacanciesResultV1,
} from "./external-vacancies";
import type { InterestStatus } from "./interest-snapshot";
import { readMyOpportunitySeen, toSeenState } from "./seen";
import {
  applyDiscoveryFilters,
  activeFilterCount,
  externalAdMatchesFilters,
  type DiscoveryFilterState,
} from "./discovery-filters";
import {
  countUnseenRecommendations,
  deriveJobRecommendations,
  type JobRecommendation,
  type SeenState,
} from "./recommendations-model";

/**
 * Worker job recommendations — the ONE server read model behind every
 * surfacing point (dashboard "Man tinkantys darbai" card, the aggregate
 * "new matching jobs" notification-spine signal, the journal context block).
 *
 * REUSES the whole existing pipeline — the gated worker-visibility RPC +
 * the canonical PR4 match engine via loadWorkerOpportunities() — and only
 * layers the pure recommendation derivation (recommendations-model.ts) plus
 * the worker's own seen markers on top. NO second engine, NO parallel data
 * source, NO persistence of any fit number (§19 d — computed at read time).
 *
 * Request-cached (React `cache`): the dashboard layout's spine read, the
 * overview card and the journal block share ONE computation per request.
 *
 * Auth model: session-derived (auth.uid()), like every other own-data read
 * in lib/opportunities — a caller can only ever get the signed-in worker's
 * own recommendations.
 */

export type WorkerJobRecommendationsResult =
  | { readonly kind: "no-worker" }
  | {
      readonly kind: "ready";
      /** True only once the owner-gated worker-visibility RPC is applied —
       *  until then the board itself has no data and the surfaces render
       *  NOTHING (no fake empty state about "no matches"). */
      readonly boardAvailable: boolean;
      /** True only once the owner-gated seen store is applied. */
      readonly seenAvailable: boolean;
      /** True when the seen read failed for a reason OTHER than the store
       *  being unapplied — i.e. something is actually broken. Kept distinct so
       *  a real outage can never masquerade as the approved degradation. */
      readonly seenReadDegraded: boolean;
      /** True only once the owner-gated interest table is applied. While it is
       *  false a surface must offer NO interest control — a dead button is a
       *  fake capability. */
      readonly interestAvailable: boolean;
      /** The worker's OWN interest status per demand id, exactly as the board
       *  read already returned it. A demand with no signal is simply absent —
       *  nothing is defaulted or invented. */
      readonly interestStatusByRequestId: Readonly<Record<string, InterestStatus>>;
      /** ALL recommendable matches, best first (shared §19 comparator). */
      readonly all: readonly JobRecommendation[];
      /** The authorized board rows this derivation ran over.
       *
       *  Carried so a caller that needs a FILTERED view (the AI workspace, W4:
       *  "I want work in Germany") can apply the canonical discovery filters
       *  and re-run the SAME derivation, instead of growing a second ranking
       *  path. Filtering happens before the derivation, never after — a filter
       *  applied to an already-ranked top-N would silently drop matches the
       *  person asked for. */
      readonly boardOpportunities: readonly OpportunityCard[];
      /** The seen state that produced `all`, so the re-derivation is identical. */
      readonly seenState: SeenState;
      /** Unseen recommendations — the aggregate spine count. 0 while the
       *  seen store is absent (a badge that cannot clear is noise). */
      readonly newCount: number;
      /** External public-source ads, exactly as the board read returned them
       *  (real-supply train). Carried so the conversation surfaces answer
       *  "find me work" with the SAME rows the board shows — no second read,
       *  no second engine. */
      readonly externalVacancies: ExternalVacanciesResultV1;
    };

const loadRecommendationsResult = cache(
  async (): Promise<WorkerJobRecommendationsResult> => {
    const board = await loadWorkerOpportunities();
    if (board.kind !== "ready") return { kind: "no-worker" };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "no-worker" };

    const seenResult = await readMyOpportunitySeen(supabase, user.id);
    const seen = toSeenState(seenResult);
    const all = deriveJobRecommendations(board.opportunities, seen, Date.now());
    // The board read already fetched the worker's own interest rows; indexing
    // them here costs no extra query and keeps the compact read model able to
    // answer "have I already signalled interest in this one?" without any
    // surface reaching for a second source.
    const interestStatusByRequestId: Record<string, InterestStatus> = {};
    for (const row of board.myInterestRows) {
      interestStatusByRequestId[row.requestId] = row.status;
    }
    return {
      kind: "ready",
      boardAvailable: !board.needsDataAccess,
      seenAvailable: seen.available,
      seenReadDegraded: seenResult.kind === "unexpected_error",
      interestAvailable: board.interestAvailable,
      interestStatusByRequestId,
      all,
      boardOpportunities: board.opportunities,
      seenState: seen,
      newCount: seen.available ? countUnseenRecommendations(all) : 0,
      externalVacancies: board.externalVacancies,
    };
  },
);

const DEFAULT_LIMIT = 3;

export interface WorkerJobRecommendations {
  readonly kind: "ready";
  readonly boardAvailable: boolean;
  readonly seenAvailable: boolean;
  readonly seenReadDegraded: boolean;
  readonly interestAvailable: boolean;
  readonly interestStatusByRequestId: Readonly<Record<string, InterestStatus>>;
  /** Top N recommendations (default 3), best first. */
  readonly recommendations: readonly JobRecommendation[];
  /** Total recommendable matches behind the top-N slice. */
  readonly totalRecommendable: number;
  readonly newCount: number;
  /** External public-source ads from the SAME board read, narrowed by the
   *  same active filters (an unknown never satisfies a stated filter —
   *  `externalAdMatchesFilters`). NOT sliced to the platform top-N: the
   *  caller decides how many to render and reports what it rendered. */
  readonly externalCards: readonly ExternalOpportunityCardV1[];
  /** Total external ads behind any slice the caller renders. */
  readonly totalExternal: number;
}

/** Top-N recommendations for the signed-in worker. `kind: "no-worker"` for
 *  accounts without a worker profile (surfaces render nothing then). */
export async function getWorkerJobRecommendations(options?: {
  readonly limit?: number;
  /**
   * Canonical discovery filters (W4 — the AI writes World State). Omitted or
   * empty ⇒ byte-identical behaviour to before: the request-cached `all` is
   * used untouched. With filters, the SAME derivation re-runs over the filtered
   * board rows, so ranking, the §19 basis and the recommendable rule are the
   * ones they have always been.
   */
  readonly filters?: DiscoveryFilterState;
}): Promise<{ readonly kind: "no-worker" } | WorkerJobRecommendations> {
  const result = await loadRecommendationsResult();
  if (result.kind !== "ready") return { kind: "no-worker" };
  const limit = Math.max(1, options?.limit ?? DEFAULT_LIMIT);

  const filters = options?.filters;
  const filtersActive = filters != null && activeFilterCount(filters) > 0;
  const filtered = filtersActive
    ? deriveJobRecommendations(
        applyDiscoveryFilters(result.boardOpportunities, filters),
        result.seenState,
        Date.now(),
      )
    : result.all;

  const externalCards = filtersActive
    ? result.externalVacancies.cards.filter((c) =>
        externalAdMatchesFilters(c.view, filters),
      )
    : result.externalVacancies.cards;

  return {
    kind: "ready",
    boardAvailable: result.boardAvailable,
    seenAvailable: result.seenAvailable,
    seenReadDegraded: result.seenReadDegraded,
    interestAvailable: result.interestAvailable,
    interestStatusByRequestId: result.interestStatusByRequestId,
    recommendations: filtered.slice(0, limit),
    totalRecommendable: filtered.length,
    newCount: result.newCount,
    externalCards,
    totalExternal: externalCards.length,
  };
}

/* The aggregate spine count moved to the canonical marketplace use case
 * (`lib/marketplace/worker-opportunities.ts` → getNewMarketplaceMatchCount).
 * Keeping a second entrypoint here would give the same attention signal two
 * identities — exactly the duplication Stage B removes. */
