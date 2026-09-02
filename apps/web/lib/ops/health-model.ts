/**
 * Production health — pure model (FINAL COMPLETION Train L1, 2026-09-02).
 *
 * `/api/health` answers ONE question for a monitor: "can the product serve a
 * person right now?" — and nothing else. The shape is deliberately boring:
 * booleans + latencies + the build id. No PII, no counts of anything a
 * person owns, no secrets, no internal hostnames. A monitor that pages on
 * `ok: false` maps to real user impact: the auth server or the database
 * cannot answer, so nobody can sign in or read.
 *
 * Checks (each bounded by a timeout so a hung dependency never hangs the probe):
 *   auth — GoTrue `/auth/v1/settings` (public, no key needed beyond the anon
 *          key that ships in every browser bundle);
 *   db   — the anon-executable `count_public_vacancies_v1` RPC through
 *          PostgREST (by design public; a real query through the pooler).
 *
 * PURE: this module shapes results; the route performs the IO.
 */

export type HealthCheck = {
  readonly ok: boolean;
  readonly ms: number;
  /** Bounded, non-secret reason when not ok: an HTTP status or an error
   *  class name. Never a message body, never a URL. */
  readonly reason?: string;
};

export type HealthReport = {
  readonly ok: boolean;
  readonly at: string;
  readonly build: string | null;
  readonly region: string | null;
  readonly checks: {
    readonly auth: HealthCheck;
    readonly db: HealthCheck;
  };
};

/** Overall health is the conjunction of the dependencies a sign-in needs. */
export function summarizeHealth(input: {
  auth: HealthCheck;
  db: HealthCheck;
  build: string | null;
  region: string | null;
  now: Date;
}): HealthReport {
  return {
    ok: input.auth.ok && input.db.ok,
    at: input.now.toISOString(),
    build: input.build,
    region: input.region,
    checks: { auth: input.auth, db: input.db },
  };
}

/** Turn a thrown value into a bounded reason: the error's class name only. */
export function boundedReason(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && /^[A-Za-z]{1,40}$/.test(name)) return name;
  }
  return "Error";
}

/** Run a check with a hard timeout; a timeout is a failed check, not a hang. */
export async function timedCheck(
  run: (signal: AbortSignal) => Promise<{ ok: boolean; reason?: string }>,
  timeoutMs: number,
): Promise<HealthCheck> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await run(controller.signal);
    return { ok: result.ok, ms: Date.now() - started, ...(result.reason ? { reason: result.reason } : {}) };
  } catch (error) {
    const reason = controller.signal.aborted ? "timeout" : boundedReason(error);
    return { ok: false, ms: Date.now() - started, reason };
  } finally {
    clearTimeout(timer);
  }
}
