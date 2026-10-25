/**
 * Provider COOLDOWN — runtime health from real failures (2026-10-25).
 *
 * `provider-health.ts` says what the operator CONFIGURED; it deliberately makes
 * no network call, so a provider that answered 429 a second ago still reports
 * `ready`. With one paid vendor that did not matter. With a chain of free tiers
 * it does: a free allowance that is spent stays spent for minutes (a rate
 * window) or until 00:00 UTC (a daily allocation), and asking it again on
 * every run adds a round-trip of latency to each request for an answer that is
 * already known — and burns the next window early.
 *
 * So a provider-attributed failure puts that provider in a short, bounded
 * COOLDOWN: the chain tries it LAST instead of first (see `order`) — so the
 * next request starts at a healthier candidate — and a success clears it.
 *
 *   RATE_LIMIT   → the vendor's own `retry-after` when it sent one, else 60 s;
 *   UNAVAILABLE  → 30 s (5xx, connection refused, DNS);
 *   TIMEOUT      → 30 s;
 *   repeated failures double the window, capped at 15 minutes — a spent daily
 *   allocation is re-probed at most four times an hour, never every request.
 *
 * Request-attributed failures (INVALID_OUTPUT, TRUNCATED, PRIVACY_BLOCK, …)
 * never cool a provider down: they say nothing about the provider.
 *
 * In-memory, per process, by design. Production is one container on one VPS;
 * a restart forgets every cooldown, which is the safe direction (it costs one
 * extra attempt, never a skipped healthy provider). No IO, no env, no
 * server-only; `now` is injected so every rule is testable without timers.
 */
import type { AiChainProviderId, ChainFailureClass } from "./provider-chain";

export const COOLDOWN_BASE_MS: Readonly<Partial<Record<ChainFailureClass, number>>> = {
  RATE_LIMIT: 60_000,
  UNAVAILABLE: 30_000,
  TIMEOUT: 30_000,
};
export const COOLDOWN_MIN_MS = 5_000;
export const COOLDOWN_MAX_MS = 15 * 60_000;

interface CooldownEntry {
  readonly until: number;
  readonly failures: number;
  readonly reason: string;
}

/** The vendor's `retry-after` as the adapter recorded it, in ms; null if absent. */
export function retryAfterMsFrom(message: string | undefined): number | null {
  const m = /retry-after (\d+)s/.exec(message ?? "");
  return m ? Number(m[1]) * 1000 : null;
}

export class ProviderCooldown {
  private readonly entries = new Map<AiChainProviderId, CooldownEntry>();

  /** Record a failure. Returns the cooldown end (ms epoch), or null when this
   *  failure class does not cool a provider down. */
  noteFailure(
    id: AiChainProviderId,
    failure: ChainFailureClass,
    message: string | undefined,
    now: number,
  ): number | null {
    const base = COOLDOWN_BASE_MS[failure];
    if (base === undefined) return null;
    const previous = this.entries.get(id);
    const failures = (previous && previous.until > now - COOLDOWN_MAX_MS ? previous.failures : 0) + 1;
    const vendorHint = failure === "RATE_LIMIT" ? retryAfterMsFrom(message) : null;
    const window = vendorHint ?? base * 2 ** (failures - 1);
    const ms = Math.min(COOLDOWN_MAX_MS, Math.max(COOLDOWN_MIN_MS, window));
    const until = now + ms;
    this.entries.set(id, {
      until,
      failures,
      reason: `cooling down after ${failure} (${Math.ceil(ms / 1000)} s, failure ${failures})`,
    });
    return until;
  }

  /** A provider answered: whatever it suffered before is over. */
  noteSuccess(id: AiChainProviderId): void {
    this.entries.delete(id);
  }

  /** The cooldown in force for a provider right now, or null. */
  activeFor(id: AiChainProviderId, now: number): { until: number; reason: string } | null {
    const e = this.entries.get(id);
    return e && e.until > now ? { until: e.until, reason: e.reason } : null;
  }

  /**
   * The candidates in the order to TRY them: every provider not cooling down
   * first (original order kept), cooling providers last (original order kept).
   *
   * A cooldown REORDERS, it never removes. With one configured provider, a
   * single timeout must not turn into thirty seconds of "no AI" for everyone —
   * the cooling provider is still tried, just after anything healthier. And it
   * can never PROMOTE anything: it only ever sees the chain's own candidates,
   * which are already privacy-vetoed and configured.
   */
  order<T extends { readonly id: AiChainProviderId }>(candidates: readonly T[], now: number): T[] {
    const fresh = candidates.filter((c) => this.activeFor(c.id, now) === null);
    const cooling = candidates.filter((c) => this.activeFor(c.id, now) !== null);
    return [...fresh, ...cooling];
  }

  /** Test seam. */
  clear(): void {
    this.entries.clear();
  }
}

/** The process-wide cooldown the server boundary hands to dispatch. */
export const sharedProviderCooldown = new ProviderCooldown();
