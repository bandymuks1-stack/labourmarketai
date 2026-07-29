import "server-only";

/**
 * Sliding-window rate limiter for ANONYMOUS write paths — audit finding M-03.
 *
 * WHY THIS EXISTS
 * ---------------
 * The security audit found every anonymous write path in the product had NO
 * throttle of any kind:
 *
 *   - `submit_company_need_public_v1` — the one intentional anonymous WRITE.
 *     `lib/security/anon-secdef-allowlist.ts` documents this honestly as
 *     `abuseControls: "GAP — ..."`: no DB rate limit, no duplicate check, no
 *     per-IP or per-email throttle, and rows up to ~8 KB carrying employer PII.
 *   - `/api/waitlist` — anon INSERT; the UNIQUE email constraint stops repeats
 *     of the SAME address but nothing stops unbounded distinct addresses.
 *
 * The ceiling was storage exhaustion plus unsolicited PII arriving in tables an
 * operator then has to triage by hand. This module is the application-layer
 * brake that was missing.
 *
 * HONEST LIMITS — READ BEFORE RELYING ON IT
 * -----------------------------------------
 * State is IN-MEMORY, so on serverless it is PER-INSTANCE. An attacker spread
 * across many cold instances gets more than `limit` requests in total. This is
 * the same trade the (since-removed) first-party Google endpoint documented:
 * a brake on naive abuse, NOT a distributed quota. It is strictly better than
 * the nothing that was there before, and it is deliberately not described as a
 * hard guarantee.
 *
 * A real quota needs shared state (Postgres or Redis). That is a follow-up, and
 * it must NOT be presented as done by this module.
 *
 * Fail-CLOSED on a missing client key: an unidentifiable caller is counted
 * against a shared bucket rather than waved through, so stripping the
 * forwarding header cannot buy unlimited writes.
 */

export type RateLimitDecision = {
  /** True when the caller is over budget and the write must be refused. */
  readonly limited: boolean;
  /** Requests already recorded in the current window (including this one). */
  readonly count: number;
  /** Seconds until the window frees up. 0 when not limited. */
  readonly retryAfterSeconds: number;
};

type Bucket = number[];

/** One map per named limiter so surfaces cannot consume each other's budget. */
const buckets = new Map<string, Map<string, Bucket>>();

/** Hard cap on tracked keys per limiter, so the map cannot grow unbounded. */
const MAX_KEYS = 10_000;

function bucketFor(name: string): Map<string, Bucket> {
  let m = buckets.get(name);
  if (!m) {
    m = new Map<string, Bucket>();
    buckets.set(name, m);
  }
  return m;
}

/**
 * Record one attempt for `key` and report whether it exceeds `limit` within
 * `windowMs`.
 *
 * `nowMs` is injectable so tests are deterministic and never sleep.
 */
export function rateLimit(opts: {
  readonly name: string;
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly nowMs?: number;
}): RateLimitDecision {
  const { name, key, limit, windowMs } = opts;
  const now = opts.nowMs ?? Date.now();
  const map = bucketFor(name);

  const recent = (map.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    // Do NOT record this attempt — otherwise a caller who keeps hammering
    // extends their own lockout forever and `retryAfter` never converges.
    map.set(key, recent);
    const oldest = recent[0] ?? now;
    return {
      limited: true,
      count: recent.length,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  recent.push(now);
  map.set(key, recent);

  if (map.size > MAX_KEYS) {
    for (const [k, v] of map) {
      if (v.every((t) => now - t >= windowMs)) map.delete(k);
      if (map.size <= MAX_KEYS) break;
    }
  }

  return { limited: false, count: recent.length, retryAfterSeconds: 0 };
}

/**
 * Best-effort client identity from proxy headers.
 *
 * Returns the FIRST `x-forwarded-for` hop (the client as the edge saw it).
 * Callers can spoof this header when the app is reachable without a trusted
 * proxy, which is why this is a brake and not an identity. When nothing usable
 * is present it returns a constant so those callers share one bucket instead of
 * each getting a fresh unlimited one.
 */
export function clientKeyFromHeaders(h: Headers): string {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const vercel = h.get("x-vercel-forwarded-for")?.trim();
  if (vercel) return vercel;
  return "unknown-client";
}

/** Test-only: drop all recorded state so cases cannot leak into each other. */
export function __resetRateLimitsForTest(): void {
  buckets.clear();
}
