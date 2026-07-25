import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { loadWorkerOpportunities } from "./load-worker-opportunities";
import { readMyOpportunitySeen, toSeenState } from "./seen";
import {
  countUnseenRecommendations,
  deriveJobRecommendations,
  type JobRecommendation,
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
      /** ALL recommendable matches, best first (shared §19 comparator). */
      readonly all: readonly JobRecommendation[];
      /** Unseen recommendations — the aggregate spine count. 0 while the
       *  seen store is absent (a badge that cannot clear is noise). */
      readonly newCount: number;
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
    return {
      kind: "ready",
      boardAvailable: !board.needsDataAccess,
      seenAvailable: seen.available,
      seenReadDegraded: seenResult.kind === "unexpected_error",
      all,
      newCount: seen.available ? countUnseenRecommendations(all) : 0,
    };
  },
);

const DEFAULT_LIMIT = 3;

export interface WorkerJobRecommendations {
  readonly kind: "ready";
  readonly boardAvailable: boolean;
  readonly seenAvailable: boolean;
  readonly seenReadDegraded: boolean;
  /** Top N recommendations (default 3), best first. */
  readonly recommendations: readonly JobRecommendation[];
  /** Total recommendable matches behind the top-N slice. */
  readonly totalRecommendable: number;
  readonly newCount: number;
}

/** Top-N recommendations for the signed-in worker. `kind: "no-worker"` for
 *  accounts without a worker profile (surfaces render nothing then). */
export async function getWorkerJobRecommendations(options?: {
  readonly limit?: number;
}): Promise<{ readonly kind: "no-worker" } | WorkerJobRecommendations> {
  const result = await loadRecommendationsResult();
  if (result.kind !== "ready") return { kind: "no-worker" };
  const limit = Math.max(1, options?.limit ?? DEFAULT_LIMIT);
  return {
    kind: "ready",
    boardAvailable: result.boardAvailable,
    seenAvailable: result.seenAvailable,
    seenReadDegraded: result.seenReadDegraded,
    recommendations: result.all.slice(0, limit),
    totalRecommendable: result.all.length,
    newCount: result.newCount,
  };
}

/* The aggregate spine count moved to the canonical marketplace use case
 * (`lib/marketplace/worker-opportunities.ts` → getNewMarketplaceMatchCount).
 * Keeping a second entrypoint here would give the same attention signal two
 * identities — exactly the duplication Stage B removes. */
