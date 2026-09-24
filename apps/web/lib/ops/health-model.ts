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
 *   vacancyFreshness — (2026-09-23) how old the imported supply is, from the
 *          anon-executable `count_public_vacancies_v1` (a maintained
 *          single-row read since 20260903100000, constant cost). Vacancy
 *          ingestion is a GitHub-hosted schedule in a PUBLIC repository, and
 *          GitHub disables such schedules after 60 days without repository
 *          activity; the only monitor lived in the same failure domain. This
 *          field is the out-of-band signal: an external monitor watching
 *          `vacancyFreshness.state === "stale"` sees a silent stop.
 *          INFORMATIONAL — it never changes the HTTP status: `ok` and
 *          200/503 stay "can the product serve a person right now?".
 *
 * PURE: this module shapes results; the route performs the IO.
 */

import {
  classifySourceFreshness,
  type SourceFreshnessState,
} from "@/lib/vacancy-sources/source-freshness";

export type HealthCheck = {
  readonly ok: boolean;
  readonly ms: number;
  /** Bounded, non-secret reason when not ok: an HTTP status or an error
   *  class name. Never a message body, never a URL. */
  readonly reason?: string;
};

/**
 * Operator thresholds for the imported supply. The stream re-confirms ads
 * several times a day; one missed day is `delayed`, three is `stale` — the
 * value a monitor pages on. These are wider than the worker-facing product
 * thresholds in source-freshness.ts on purpose: a board notice and an
 * operator page are different questions.
 */
export const VACANCY_FRESHNESS_DELAYED_AFTER_HOURS = 24;
export const VACANCY_FRESHNESS_STALE_AFTER_HOURS = 72;

export type VacancyFreshnessCheck = HealthCheck & {
  /** `ok` above means "the freshness read answered"; this is the answer. */
  readonly state: SourceFreshnessState;
  /** Newest `last_seen_at` the importer confirmed, when known. */
  readonly lastRefreshedAt: string | null;
  readonly ageHours: number | null;
  readonly staleAfterHours: number;
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
  readonly vacancyFreshness: VacancyFreshnessCheck;
};

/** The freshness probe's answer, classified. A probe that did not answer is
 *  `unavailable`; an answer with no timestamp (empty corpus) is `unknown`. */
export function buildVacancyFreshness(input: {
  probe: HealthCheck;
  lastRefreshedAt: string | null;
  now: Date;
}): VacancyFreshnessCheck {
  const f = classifySourceFreshness({
    lastRefreshedAt: input.probe.ok ? input.lastRefreshedAt : null,
    nowIso: input.now.toISOString(),
    unavailable: !input.probe.ok,
    thresholds: {
      delayedAfterHours: VACANCY_FRESHNESS_DELAYED_AFTER_HOURS,
      staleAfterHours: VACANCY_FRESHNESS_STALE_AFTER_HOURS,
    },
  });
  return {
    ...input.probe,
    state: f.state,
    lastRefreshedAt: f.lastRefreshedAt,
    ageHours: f.ageHours,
    staleAfterHours: VACANCY_FRESHNESS_STALE_AFTER_HOURS,
  };
}

/** Overall health is the conjunction of the dependencies a sign-in needs.
 *  Vacancy freshness is reported beside it and NEVER folded into `ok`. */
export function summarizeHealth(input: {
  auth: HealthCheck;
  db: HealthCheck;
  vacancyFreshness: VacancyFreshnessCheck;
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
    vacancyFreshness: input.vacancyFreshness,
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
