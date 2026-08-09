/**
 * Canonical Marketplace application contract (Stage B).
 *
 * PURE module — no IO, no server-only, no supabase. Safe to import from server
 * components, server actions, client components and tests alike.
 *
 * This is the vocabulary every marketplace surface speaks. Per the canonical
 * owner decision (docs/owner-decisions/work-journal-conversation-architecture-v1.md
 * §12) the flow is:
 *
 *   UI SURFACE → APPLICATION USE CASE → DOMAIN → REPOSITORY/ADAPTER → RPC/DB
 *
 * A surface never decides *how* marketplace state is stored, never sees a
 * Postgres/PostgREST error code, and never learns the name of a table or RPC.
 * It says "these are the opportunities I actually put in front of the human"
 * and receives an honest outcome back.
 */

/**
 * The surfaces that may show a worker their opportunities. Adding one is a
 * deliberate act: it must go through the same use case, and a guard test pins
 * that every entry here is really rendered by something
 * (`canonical-marketplace-use-case.test.ts`, rule 4).
 *
 * W3 row 5 removed a fourth, `dashboard_recommendations` — the worker-overview
 * "Man tinkantys darbai" card on `/dashboard/advanced`. That capability did not
 * disappear; it became the `opportunities` RESULT, which reports under
 * `conversation`, the surface it actually is. The entry is deleted rather than
 * kept "just in case" precisely because rule 4 would otherwise be asserting
 * something untrue about the product.
 */
export const MARKETPLACE_SURFACES = [
  /** The conversation window — the primary work journal (canonical §0). This
   *  is also where the `opportunities` result renders (W3 row 5). */
  "conversation",
  /** /dashboard/opportunities — the full structured board. */
  "opportunities_board",
  /** The journal → jobs context block. */
  "journal_context",
] as const;

export type MarketplaceSurface = (typeof MARKETPLACE_SURFACES)[number];

/**
 * Why a mark-shown call did or did not persist.
 *
 * `feature_unavailable` is the ONLY reason that may degrade to a silent no-op
 * for the human: the owner-gated store genuinely does not exist yet, and the
 * product has decided that an un-clearable badge is worse than no badge.
 * Everything else is a real event the caller must be able to see.
 */
export type MarkShownReason =
  | "persisted"
  | "feature_unavailable"
  | "not_authenticated"
  | "nothing_shown"
  | "unexpected_error";

/**
 * The outcome contract shared by all four surfaces.
 *
 * `available` is deliberately tri-state:
 *   - `true`  — the seen store answered; the capability exists.
 *   - `false` — the store is provably absent (owner-gated migration unapplied).
 *   - `null`  — this call did not determine it (nothing was shown, no session,
 *               or an unexpected failure). Claiming `false` there would be a
 *               guess dressed up as a fact.
 *
 * `persisted` is never `true` unless the write actually happened. No surface
 * may render "seen" state as saved on anything else.
 */
export interface MarkShownOutcome {
  readonly available: boolean | null;
  readonly persisted: boolean;
  readonly reason: MarkShownReason;
  /** Rows the store reports it recorded. 0 unless `persisted`. */
  readonly marked: number;
}

/** Hard bound per call — mirrors the RPC's own cap so the adapter and the
 *  application layer can never disagree about what a valid payload is. */
export const MAX_SHOWN_IDS_PER_CALL = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalize the ids a surface claims it showed: drop anything that is not a
 * uuid, de-duplicate, and cap. Sorted so that the same displayed set always
 * produces the same payload — which is what makes a repeat call provably
 * idempotent at the application layer, on top of the store's own
 * conflict-is-a-no-op guarantee.
 */
export function normalizeShownIds(ids: readonly string[]): readonly string[] {
  return [...new Set(ids.filter((id) => UUID_RE.test(id)))]
    .sort()
    .slice(0, MAX_SHOWN_IDS_PER_CALL);
}

/** What a surface passes when it has rendered opportunities to the human.
 *
 *  Stage C extension point: this input is where conversation provenance will
 *  attach (`conversationId`, `messageId`, `actionId`) so a shown opportunity
 *  can be traced back to the assistant turn that produced it. Nothing is added
 *  here yet — Stage B does not create transcript tables — but the contract is
 *  an object precisely so those fields can be added without touching a single
 *  surface. */
export interface MarkShownInput {
  readonly surface: MarketplaceSurface;
  /** ONLY the ids actually rendered to the human. Never "everything loaded". */
  readonly shownRequestIds: readonly string[];
}

/* Types only — both modules are pure, so this file stays pure. */
import type { InterestStatus } from "@/lib/opportunities/interest-snapshot";
import type { JobRecommendation } from "@/lib/opportunities/recommendations-model";

/**
 * How many matches the conversation's opportunities RESULT shows (W3 row 5).
 *
 * Fixed here rather than accepted from the client: the result's server
 * entrypoint takes no arguments, so no caller can widen its own read.
 */
export const OPPORTUNITIES_RESULT_LIMIT = 5;

/** How many EXTERNAL public-source ads the result shows before deferring to
 *  the full board. Same reasoning as the platform limit above: fixed in the
 *  contract so no client can widen its own read. */
export const OPPORTUNITIES_RESULT_EXTERNAL_LIMIT = 5;

/**
 * What the opportunities RESULT hands its panel — the client-safe projection of
 * `MarketplaceMatchesView` (W3 row 5).
 *
 * It lives in this PURE module, not next to the use case, because the panel is
 * a client component: `worker-opportunities.ts` is `server-only`, and a surface
 * reaching into it — even for a type — is the boundary this contract exists to
 * keep. The three cases below are the only answers the panel may render, and
 * each is a DIFFERENT fact, never collapsed into "nothing to show":
 *
 *   `no-worker`    — the caller has no worker row; matching cannot mean
 *                    anything yet, so the panel says that and offers the board.
 *   `unavailable`  — the owner-gated worker-visibility RPC is unapplied, so
 *                    there is no demand data AT ALL. "No matches" would be a
 *                    false claim about data that cannot exist yet.
 *   `ready`        — real rows. An empty `matches` here is an honest empty:
 *                    the read worked and found nothing.
 */
export type OpportunitiesResultView =
  | { readonly kind: "no-worker" }
  | { readonly kind: "unavailable" }
  | {
      readonly kind: "ready";
      /** Ranked, explained matches — best first, already the displayed slice. */
      readonly matches: readonly OpportunitiesResultMatch[];
      /** How many matches exist beyond the shown slice's cap. */
      readonly totalRecommendable: number;
      /** Unseen matches over ALL recommendable rows. 0 while the seen store is
       *  unapplied — a badge that can never clear is noise, not a signal. */
      readonly newCount: number;
      /** The seen read failed for a reason OTHER than "not applied yet", so
       *  the new-markers are not trustworthy this render. The panel keeps the
       *  rows (they are real) and stops claiming novelty — the PARTIAL state. */
      readonly seenDegraded: boolean;
      /**
       * Copy for the canonical `WorkerInterestButton`, resolved by the ONE
       * server-side resolver (`lib/opportunities/interest-labels.ts`).
       *
       * It travels with the view rather than being looked up in the panel on
       * purpose: that resolver's own header warns that the moment a second
       * surface resolves these strings itself, the express-interest control
       * starts speaking two dialects of the same action.
       *
       * `null` means the owner-gated interest table is absent — which is also
       * the availability signal, so there is no separate boolean to disagree
       * with it. The rows then stay read-only rather than showing a button
       * that cannot write.
       */
      readonly interestLabels: InterestLabelBag | null;
      /**
       * External public-source ads (real-supply train) — the displayed slice.
       * The SAME rows the board's external section renders, projected to the
       * facts a compact row can honestly show. The panel is the conversation's
       * renderer, so "find me work" must surface these too: a chat that says
       * "nothing matched" while the board shows real ads would make the two
       * surfaces disagree about whether work exists.
       */
      readonly external: readonly OpportunitiesResultExternalRow[];
      /** How many external ads exist beyond the shown slice's cap. */
      readonly totalExternal: number;
    };

/** The 10 strings `WorkerInterestButton` needs. Declared here, in the pure
 *  contract, so the server-only resolver and the client panel agree on one
 *  shape without either importing the other. */
export interface InterestLabelBag {
  readonly express: string;
  readonly sent: string;
  readonly reviewed: string;
  readonly contacted: string;
  readonly withdraw: string;
  readonly internalNote: string;
  readonly error: string;
  readonly contactedLink: string;
  readonly contactEmployer: string;
  readonly contactError: string;
}

/**
 * One EXTERNAL public-source ad, as the panel renders it.
 *
 * A projection of `ExternalOpportunityCardV1` limited to what a compact row
 * can honestly show. Provenance is NOT optional: the attribution code and the
 * publisher's original URL travel with every row, because an external ad
 * rendered without its source would read as a labourmarket.ai posting — the
 * exact dishonesty the presentation contract forbids. No platform action is
 * carried at all: the ONLY route on an unclaimed ad is the original
 * advertisement.
 */
export interface OpportunitiesResultExternalRow {
  /** Stable render key: provider + the publisher's own id. */
  readonly key: string;
  readonly title: string;
  readonly employerName: string | null;
  readonly city: string | null;
  readonly country: string | null;
  /** ISO date (sliced) the publisher stated. */
  readonly publishedAt: string;
  /** The publisher's original advertisement — the one action. */
  readonly originalUrl: string | null;
  /**
   * The mandatory source attribution line, RESOLVED server-side.
   *
   * Text, not a code, for the same reason `InterestLabelBag` travels with the
   * view: the panel is a client component and the client message bundle does
   * not carry the `vacancySources` namespace — a code handed across this
   * boundary rendered raw in production (observed 2026-08-10). The ONE
   * server-side resolution also keeps every surface speaking identical
   * attribution wording.
   */
  readonly attributionText: string;
}

/**
 * One match, as the panel renders it.
 *
 * A structural subset of `JobRecommendation` — the fields a compact result can
 * honestly show. It is restated rather than re-exported so that widening the
 * recommendation model never silently widens what crosses the action boundary.
 * `basis` travels WHOLE (§19): counts and confirmed share together, never a
 * bare percentage.
 */
export interface OpportunitiesResultMatch {
  readonly requestId: string;
  readonly roleSlug: string | null;
  readonly country: string | null;
  readonly locationLabel: string | null;
  readonly startPeriod: string | null;
  readonly basis: {
    readonly matchedTotal: number;
    readonly needTotal: number;
    readonly matchedConfirmed: number;
  };
  readonly salary: "within" | "negotiable" | "unknown";
  readonly missingSkillSlugs: readonly string[];
  readonly isNew: boolean;
  /** The company name, when the demand carries one. The result IS the answer
   *  to "find me work" now, so a row must name who is hiring. */
  readonly companyName: string | null;
  /** The canonical match status behind the basis — carried so a badge can be
   *  coloured HONESTLY. A weak fit painted success-green tells the worker the
   *  opposite of what the use case said. */
  readonly fitStatus: JobRecommendation["status"];
  /** The worker's OWN interest status on this demand, straight from the
   *  canonical use case. `null` = no signal yet. Never guessed. */
  readonly interestStatus: InterestStatus | null;
}
