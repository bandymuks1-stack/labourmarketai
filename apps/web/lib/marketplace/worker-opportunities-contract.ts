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

/** The four surfaces that may show a worker their opportunities. Adding a
 *  fifth is a deliberate act: it must go through the same use case. */
export const MARKETPLACE_SURFACES = [
  /** The conversation window — the primary work journal (canonical §0). */
  "conversation",
  /** /dashboard/opportunities — the full structured board. */
  "opportunities_board",
  /** The worker overview "Man tinkantys darbai" card. */
  "dashboard_recommendations",
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
