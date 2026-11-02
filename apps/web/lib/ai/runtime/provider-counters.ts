/**
 * Provider COUNTERS — per-provider requests, latency, errors and rate limits
 * (owner P0-E, 2026-10-30).
 *
 * With a 0 EUR budget the free tiers are the only vendors that can ever run,
 * and their limits are per-provider and per-day. Before anyone decides to
 * switch one on, the operator needs to see — per provider — how many requests
 * were attempted, how many answered, how long they took, how many were
 * rate-limited (429 / quota) and how many failed for another reason.
 * `ai_runs` records one row per RUN (the final route); a run that walked three
 * free tiers before one answered leaves the two refusals only inside a string.
 * These counters keep every ATTEMPT.
 *
 * In-memory, per process, by design — exactly like `provider-cooldown.ts`:
 *   - no IO, no env, no network, no telemetry export;
 *   - no payload, prompt, output, person or organization is ever recorded —
 *     only a provider id, a failure CLASS and a latency number;
 *   - a restart resets them, which is the honest reading of "since start".
 * The clock is injected by the caller (latency is measured in run-core).
 */
import type { AiChainProviderId, ChainFailureClass } from "./provider-chain";

export interface ProviderCounterRow {
  readonly provider: AiChainProviderId;
  /** Requests handed to this provider's adapter. */
  readonly requests: number;
  readonly ok: number;
  /** 429 / quota / rate window — the provider is healthy and declining. */
  readonly rateLimited: number;
  /** Every other failure, by class (UNAVAILABLE, TIMEOUT, INVALID_OUTPUT, …). */
  readonly errors: Readonly<Partial<Record<ChainFailureClass, number>>>;
  readonly errorTotal: number;
  readonly latencyMsTotal: number;
  readonly latencyMsMax: number;
  /** Mean over every attempt (answered or not); null before the first. */
  readonly latencyMsMean: number | null;
  readonly lastAt: string | null;
}

interface MutableRow {
  requests: number;
  ok: number;
  rateLimited: number;
  errors: Partial<Record<ChainFailureClass, number>>;
  latencyMsTotal: number;
  latencyMsMax: number;
  lastAt: number | null;
}

/** "ok", or the classified failure from `classifyCompletionFailure`. */
export type ProviderAttemptOutcome = "ok" | ChainFailureClass;

export class ProviderCounters {
  private readonly rows = new Map<AiChainProviderId, MutableRow>();

  /** Record one finished attempt. Latency is clamped to ≥ 0 (clock skew). */
  noteAttempt(
    provider: AiChainProviderId,
    outcome: ProviderAttemptOutcome,
    latencyMs: number,
    now: number,
  ): void {
    const row =
      this.rows.get(provider) ??
      { requests: 0, ok: 0, rateLimited: 0, errors: {}, latencyMsTotal: 0, latencyMsMax: 0, lastAt: null };
    const ms = Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : 0;
    row.requests += 1;
    row.latencyMsTotal += ms;
    row.latencyMsMax = Math.max(row.latencyMsMax, ms);
    row.lastAt = now;
    if (outcome === "ok") row.ok += 1;
    else if (outcome === "RATE_LIMIT") row.rateLimited += 1;
    else row.errors[outcome] = (row.errors[outcome] ?? 0) + 1;
    this.rows.set(provider, row);
  }

  /** A read-only copy, sorted by provider id. Contains no payload of any kind. */
  snapshot(): readonly ProviderCounterRow[] {
    return [...this.rows.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, r]) => {
        const errorTotal = Object.values(r.errors).reduce((n, v) => n + (v ?? 0), 0);
        return {
          provider,
          requests: r.requests,
          ok: r.ok,
          rateLimited: r.rateLimited,
          errors: { ...r.errors },
          errorTotal,
          latencyMsTotal: r.latencyMsTotal,
          latencyMsMax: r.latencyMsMax,
          latencyMsMean: r.requests > 0 ? Math.round(r.latencyMsTotal / r.requests) : null,
          lastAt: r.lastAt === null ? null : new Date(r.lastAt).toISOString(),
        };
      });
  }

  /** Test seam. */
  reset(): void {
    this.rows.clear();
  }
}

/** The process-wide instance the server boundary hands to every chain run. */
export const sharedProviderCounters = new ProviderCounters();
