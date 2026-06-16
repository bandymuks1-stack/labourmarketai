/**
 * Bound a promise so a hung network request can never leave a pending /
 * "Įrašoma…" UI state stuck forever.
 *
 * Server actions and fetches are HTTP round-trips. On mobile networks a request
 * can stall without ever resolving OR rejecting (radio sleep, cell↔wifi
 * handoff, a backgrounded tab the OS freezes, a captive portal). A bare
 * `promise.then(...).catch(...)` chain then never settles, so a `saving` flag
 * is never cleared and the user is stuck on the pending label with no error and
 * no retry.
 *
 * `withTimeout` races the work against a timer. If the work has not settled by
 * `ms`, the returned promise REJECTS with a timeout error — so the caller's
 * `.catch` / `finally` runs and the pending state flips to a visible, retryable
 * error instead of hanging. The timer is always cleared, so a fast success
 * leaves no dangling timeout.
 *
 * This does NOT cancel the underlying request (a server action may still
 * complete server-side); it only guarantees the UI stops waiting. Saves are
 * idempotent upserts, so a late-landing write is harmless and a reload shows
 * the real state.
 */

/** Default ceiling for an interactive save round-trip before the UI gives up. */
export const SAVE_TIMEOUT_MS = 15_000;

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = SAVE_TIMEOUT_MS,
  label = "operation",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}-timeout`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
