import "server-only";

import {
  loadWorkerOpportunities,
  type OpportunityCard,
  type WorkerReadiness,
} from "@/lib/opportunities/load-worker-opportunities";
import { getWorkerJobRecommendations } from "@/lib/opportunities/recommendations";
import type { DiscoveryFilterState } from "@/lib/opportunities/discovery-filters";
import type { JobRecommendation } from "@/lib/opportunities/recommendations-model";
import type { MyInterestViewRow } from "@/lib/opportunities/my-interest-view";
import type { ExternalVacanciesResultV1 } from "@/lib/opportunities/external-vacancies";
import { writeOpportunitySeen } from "@/lib/opportunities/seen";
import { runMarkShown, type MarkShownPorts } from "./worker-opportunities-shown-core";
import type {
  MarketplaceSurface,
  MarkShownInput,
  MarkShownOutcome,
} from "./worker-opportunities-contract";

/**
 * THE canonical Marketplace application use case (Stage B).
 *
 * Owner decision: docs/owner-decisions/work-journal-conversation-architecture-v1.md
 * (§10 "Seen-state turi būti canonical domeno būsena, o ne keli atskiri UI
 * triukai"; §12 the target layering; ADR 0014).
 *
 * Responsibilities, all in one place:
 *
 *   load     → the gated, own-data board read (`loadWorkerOpportunities`)
 *   rank     → the shared §19 comparator, applied by the loader
 *   explain  → the canonical fit/match basis, plus the recommendation
 *              derivation (`deriveJobRecommendations`) for compact surfaces
 *   mark shown → `markOpportunitiesShown` — ONLY what a surface rendered
 *   persist  → delegated to the seen repository (RPC-only write path)
 *   save     → per-card `saved` + `savedAvailable` state travels in the view;
 *              the write stays at its existing single canonical entrypoint
 *              (`lib/opportunities/saved-actions.ts`)
 *   interest → per-card `interestStatus` + `interestAvailable` state travels
 *              in the view; the write stays at `lib/opportunities/interest-actions.ts`
 *
 * The save/interest WRITES are deliberately not re-wrapped here: each already
 * has exactly one canonical server action with one consumer, so a wrapper
 * would create a second identity for the same write — the very duplication
 * this stage exists to remove. What was genuinely fragmented, and is fixed
 * here, is the read/rank/explain/mark-shown path.
 *
 * ALL FOUR surfaces (conversation, opportunities board, dashboard
 * recommendations, journal context) enter through this module. No surface
 * computes marketplace business state of its own, imports the seen
 * repository, names a table or RPC, or interprets a driver error code.
 *
 * REALITY RULE: nothing here invents a company, a need, a salary or a score.
 * Every row is a row the gated RPC returned, ranked by the shared comparator
 * and explained by its own §19 basis (matched/total/confirmed counts). There
 * is no aggregate "AI score" anywhere in this layer, and there must not be.
 */

export type { MarketplaceSurface, MarkShownOutcome } from "./worker-opportunities-contract";

/** Capability flags shared by every marketplace surface — the honest answer to
 *  "what can this environment actually do right now". */
export interface MarketplaceCapabilities {
  /** The owner-gated worker-visibility RPC is applied; without it there is no
   *  demand data at all and surfaces must render nothing rather than an empty
   *  state that claims "no matches". */
  readonly boardAvailable: boolean;
  /** The owner-gated seen store is applied. */
  readonly seenAvailable: boolean;
  /** The seen read failed for a reason other than "not applied yet". */
  readonly seenReadDegraded: boolean;
  /** The owner-gated interest table exists. */
  readonly interestAvailable: boolean;
  /** The #723 saved-opportunities store exists. */
  readonly savedAvailable: boolean;
}

export type MarketplaceBoardView =
  | { readonly kind: "no-worker" }
  | {
      readonly kind: "ready";
      readonly surface: MarketplaceSurface;
      /** The board read does not touch the seen store, so it makes no claim
       *  about it — a guessed `seenAvailable` here would be exactly the kind
       *  of invented state this layer exists to remove. */
      readonly capabilities: Pick<
        MarketplaceCapabilities,
        "boardAvailable" | "interestAvailable" | "savedAvailable"
      >;
      readonly readiness: WorkerReadiness;
      /** Ranked, explained cards — best first (shared §19 comparator). */
      readonly opportunities: readonly OpportunityCard[];
      readonly savedRequestIds: readonly string[];
      readonly myInterestRows: readonly MyInterestViewRow[];
      /** External public-source ads (real-supply train) — same board, same
       *  engine, provenance carried. Empty until a source is activated. */
      readonly externalVacancies: ExternalVacanciesResultV1;
    };

export type MarketplaceMatchesView =
  | { readonly kind: "no-worker" }
  | {
      readonly kind: "ready";
      /** Which surface asked. NULL for a read that renders nothing at all —
       *  the aggregate attention count below is the one such caller, and
       *  naming a render surface there would be a claim that something was
       *  shown to the person when nothing was. */
      readonly surface: MarketplaceSurface | null;
      readonly capabilities: Pick<
        MarketplaceCapabilities,
        | "boardAvailable"
        | "seenAvailable"
        | "seenReadDegraded"
        | "interestAvailable"
      >;
      /** The worker's OWN interest status per demand id — the same rows the
       *  full board view already exposes, so a COMPACT surface can offer the
       *  canonical interest control instead of dead-ending on a read-only
       *  card. An absent key means "no signal"; nothing is defaulted here. The
       *  WRITE stays at its single canonical entrypoint
       *  (`lib/opportunities/interest-actions.ts`). */
      readonly interestStatusByRequestId: Readonly<
        Record<string, MyInterestViewRow["status"]>
      >;
      /** Top-N explained matches, best first. */
      readonly matches: readonly JobRecommendation[];
      readonly totalRecommendable: number;
      /** Unseen matches — 0 while the seen store is unapplied (a badge that
       *  cannot clear is noise, not a signal). */
      readonly newCount: number;
    };

/**
 * load → rank → explain, full board shape.
 *
 * Used by the structured board, which renders every authorized row and does
 * its own presentation-side narrowing. The narrowing result — not this list —
 * is what may be reported as shown.
 */
export async function loadWorkerOpportunityBoard(
  surface: MarketplaceSurface,
): Promise<MarketplaceBoardView> {
  const board = await loadWorkerOpportunities();
  if (board.kind !== "ready") return { kind: "no-worker" };
  return {
    kind: "ready",
    surface,
    capabilities: {
      boardAvailable: !board.needsDataAccess,
      interestAvailable: board.interestAvailable,
      savedAvailable: board.savedAvailable,
    },
    readiness: board.readiness,
    opportunities: board.opportunities,
    savedRequestIds: board.savedRequestIds,
    myInterestRows: board.myInterestRows,
    externalVacancies: board.externalVacancies,
  };
}

/**
 * load → rank → explain, compact "top matches" shape.
 *
 * The single read model behind the conversation, the worker-overview card and
 * the journal context block. Request-cached one layer down, so three surfaces
 * on one page cost one computation.
 */
export async function loadWorkerOpportunityMatches(input: {
  /** Omitted only by a caller that renders nothing — see `surface` on the
   *  view. Every rendering caller names itself. */
  readonly surface?: MarketplaceSurface;
  readonly limit?: number;
  /**
   * Canonical discovery filters (W4). The AI writes World State from the
   * person's own words and passes the result here; the use case hands it to
   * the ONE ranking path. No surface filters after the fact — that would drop
   * matches from an already-narrowed top-N.
   */
  readonly filters?: DiscoveryFilterState;
}): Promise<MarketplaceMatchesView> {
  const result = await getWorkerJobRecommendations({
    limit: input.limit,
    filters: input.filters,
  });
  if (result.kind !== "ready") return { kind: "no-worker" };
  return {
    kind: "ready",
    surface: input.surface ?? null,
    capabilities: {
      boardAvailable: result.boardAvailable,
      seenAvailable: result.seenAvailable,
      seenReadDegraded: result.seenReadDegraded,
      interestAvailable: result.interestAvailable,
    },
    interestStatusByRequestId: result.interestStatusByRequestId,
    matches: result.recommendations,
    totalRecommendable: result.totalRecommendable,
    newCount: result.newCount,
  };
}

/** Default ports: the real seen repository + the app's error reporting. */
const defaultPorts: MarkShownPorts = {
  writeSeen: (ids) => writeOpportunitySeen(ids),
  reportUnexpected: ({ surface, message }) => {
    // Not swallowed. The approved degradation (unapplied store) never reaches
    // here — only genuinely unexpected failures do, and they must be visible
    // in the server logs rather than dissolving into a silent no-op.
    console.error(
      `[marketplace] mark-shown failed unexpectedly (surface=${surface}): ${message}`,
    );
  },
};

/**
 * mark shown → persist.
 *
 * A surface calls this with the ids it ACTUALLY rendered to the human —
 * rendering is the read event. Reporting everything that was loaded (rather
 * than everything that was displayed) would silently retire matches the worker
 * never saw, so the input name says `shownRequestIds` and every surface is
 * guard-checked to pass its rendered slice.
 *
 * Idempotent: the payload is normalized (deduped, uuid-validated, sorted,
 * capped) so a repeat call sends an identical set, and the store's write path
 * treats a conflict as a no-op, keeping `seen_at` at first-seen.
 *
 * Works identically before and after the owner-gated migration: absent store →
 * `{ available: false, persisted: false, reason: "feature_unavailable" }` and
 * nothing else in the app changes. After the migration is applied, no surface
 * needs a code change.
 */
export async function markOpportunitiesShown(
  input: MarkShownInput,
  ports: MarkShownPorts = defaultPorts,
): Promise<MarkShownOutcome> {
  return runMarkShown(ports, input);
}

/** The aggregate "new matching jobs" attention count, through the canonical
 *  use case. `newCount` is derived over ALL recommendable matches (never the
 *  displayed slice), so the limit is irrelevant here. DEFENSIVE by design: any
 *  failure yields 0 so the auth shell can never break — and never fabricates
 *  attention. */
export async function getNewMarketplaceMatchCount(): Promise<number> {
  try {
    // NO SURFACE: this read renders nothing — it feeds the auth shell's
    // attention count. Before W3 row 5 it borrowed the worker-overview card's
    // tag; that card is gone, and borrowing another render surface's name
    // would say the person was shown rows they were not.
    const view = await loadWorkerOpportunityMatches({});
    return view.kind === "ready" ? view.newCount : 0;
  } catch {
    return 0;
  }
}
