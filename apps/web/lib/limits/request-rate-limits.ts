/**
 * Bounded request budgets for company-initiated contact surfaces (Wagon 1).
 *
 * ONE shared budget shape for the three request kinds a company can fire at
 * workers — booking proposals, in-app conversation requests, and
 * contact-detail disclosure asks. Mirrors the applied invitations abuse-guard
 * pattern (20260712200000: open-count cap + rolling 24h cap), scaled down for
 * per-worker asks.
 *
 * Pure, deterministic, no IO — the server actions count REAL rows with the
 * caller's RLS-scoped client and pass the counts here. FAIL CLOSED: when a
 * count could not be read (null), the request is refused rather than allowed
 * unbounded.
 *
 * Defense-in-depth: the same numbers are enforced inside the DB for booking
 * proposals (draft migration 20260716121000, propose_booking_request_v3) and
 * contact-disclosure asks (draft migration 20260716120000). The conversation
 * path has no RPC seam, so its cap is app-layer only (honest limitation).
 */

export interface RequestBudgetLimits {
  /** Max simultaneously open (unanswered) requests per requester. */
  readonly maxOpen: number;
  /** Max requests created in the rolling last 24 hours per requester. */
  readonly maxPerDay: number;
}

/** Shared budget for booking proposals + contact-detail asks. */
export const COMPANY_REQUEST_LIMITS: RequestBudgetLimits = {
  maxOpen: 10,
  maxPerDay: 30,
};

/** Conversations have no "open" state — only the daily budget applies. */
export const CONVERSATION_REQUEST_LIMITS: RequestBudgetLimits = {
  maxOpen: Number.POSITIVE_INFINITY,
  maxPerDay: 30,
};

export interface RequestBudgetInput {
  /** Currently open requests (null = the count could not be read). */
  readonly openCount: number | null;
  /** Requests created in the last 24h (null = the count could not be read). */
  readonly last24hCount: number | null;
}

export type RequestBudgetDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: "too_many_open" | "daily_limit" | "counts_unavailable";
    };

/**
 * Decide whether one more request fits the budget. Null counts refuse the
 * request (fail closed) — a broken counter must never mean "unlimited".
 */
export function evaluateRequestBudget(
  input: RequestBudgetInput,
  limits: RequestBudgetLimits = COMPANY_REQUEST_LIMITS,
): RequestBudgetDecision {
  const openKnown =
    typeof input.openCount === "number" && Number.isFinite(input.openCount);
  const dayKnown =
    typeof input.last24hCount === "number" && Number.isFinite(input.last24hCount);
  const openRequired = Number.isFinite(limits.maxOpen);
  if ((openRequired && !openKnown) || !dayKnown) {
    return { allowed: false, reason: "counts_unavailable" };
  }
  if (openRequired && (input.openCount as number) >= limits.maxOpen) {
    return { allowed: false, reason: "too_many_open" };
  }
  if ((input.last24hCount as number) >= limits.maxPerDay) {
    return { allowed: false, reason: "daily_limit" };
  }
  return { allowed: true };
}

/** ISO timestamp for "24 hours ago" — the rolling-window floor for counting. */
export function rollingDayFloorIso(now: Date = new Date()): string {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
}
