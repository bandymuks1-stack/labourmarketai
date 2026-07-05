/**
 * Messaging abuse / spam rate caps (§8.2 — product-tree branch 20) — PURE
 * decision logic.
 *
 * The internal messaging minimum needs an abuse/spam floor: a real user can
 * chat freely, a scripted flood cannot. The caps are app-side windowed counts
 * over the EXISTING 0021 tables (no new schema, no external service):
 *
 *   - MESSAGE_RATE_CAP        — messages a single author may send across all
 *     conversations inside one rolling window;
 *   - CONVERSATION_RATE_CAP   — conversations a single creator may open
 *     inside one rolling window (covers direct opens AND support threads —
 *     every creation path goes through createConversation).
 *
 * The counts come from the caller's OWN RLS-scoped reads (their own authored
 * messages / their own created conversations), so no other user's data is
 * touched. A revoked participation can undercount old messages — the cap can
 * only ever be MORE generous, never silently stricter.
 *
 * Default-closed: when the recent count cannot be read (query error → the
 * caller passes null/undefined), the decision is `unavailable` and the write
 * MUST NOT proceed — a failed safety check is never a bypass path.
 *
 * Pure, no IO, deterministic — unit-tested.
 */

export interface RateCap {
  /** Rolling window length in minutes. */
  readonly windowMinutes: number;
  /** Maximum writes allowed inside the window. */
  readonly max: number;
}

/** Messages per author across all conversations: 120 per rolling hour.
 *  Generous for a real conversation (2 messages/minute sustained), hostile
 *  to scripted floods. */
export const MESSAGE_RATE_CAP: RateCap = { windowMinutes: 60, max: 120 };

/** New conversations per creator: 20 per rolling 24h. A real user opens a
 *  handful of threads a day; bulk cold-outreach cannot. Matches the spirit of
 *  the existing MAX_PARTICIPANTS = 20 fan-out cap. */
export const CONVERSATION_RATE_CAP: RateCap = { windowMinutes: 24 * 60, max: 20 };

export type RateCapDecision = "allowed" | "rate_limited" | "unavailable";

/** ISO timestamp of the start of the cap's rolling window. */
export function rateCapWindowStartIso(cap: RateCap, nowMs: number = Date.now()): string {
  return new Date(nowMs - cap.windowMinutes * 60_000).toISOString();
}

/**
 * Decide whether one more write is allowed given the recent count inside the
 * cap's window. Default-closed:
 *   - null / undefined / NaN / negative count (the windowed read failed or
 *     returned nonsense) → `unavailable` — the write must not proceed;
 *   - count >= max → `rate_limited`;
 *   - otherwise → `allowed`.
 */
export function evaluateRateCap(
  recentCount: number | null | undefined,
  cap: RateCap,
): RateCapDecision {
  if (
    recentCount === null ||
    recentCount === undefined ||
    !Number.isFinite(recentCount) ||
    recentCount < 0
  ) {
    return "unavailable";
  }
  if (recentCount >= cap.max) return "rate_limited";
  return "allowed";
}
