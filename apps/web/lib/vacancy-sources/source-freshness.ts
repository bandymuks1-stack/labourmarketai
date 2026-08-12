/**
 * EXTERNAL SOURCE FRESHNESS — how old is the supply we are showing?
 *
 * ── THE PROBLEM THIS EXISTS FOR ────────────────────────────────────────────
 * On 2026-08-12 production held 87 Swedish ads, 87 of 87 flagged `is_active`,
 * newest `last_seen_at` 2026-08-09 20:05Z — and the importer had been failing
 * `page_fetch_failed` since 2026-08-10. A worker opening the board saw 87 jobs
 * with no indication that nothing had been re-confirmed for two and a half
 * days. Presenting an unconfirmed external ad as current supply is the exact
 * dishonesty this train exists to remove: the platform does not control the
 * vacancy, and cannot promise it is still open.
 *
 * ── WHY `last_seen_at`, NOT THE IMPORT CURSOR ──────────────────────────────
 * `vacancy_import_cursors` carries the richer operator story (last success,
 * last failure code, consecutive failures) — but it has RLS enabled with NO
 * policy and SELECT granted only to `postgres` / `service_role`. A worker
 * literally cannot read it, and the board renders with the WORKER'S OWN
 * client (a board needing service_role would mean the policy was wrong).
 * Widening that grant would be a new disclosure of operational state to every
 * signed-in user, and an owner-gated migration.
 *
 * `public_vacancies.last_seen_at` is already readable by `authenticated`
 * (policy `public_vacancies_read_active USING (is_active)`), and it means
 * precisely the thing the worker needs to know: the last time the importer
 * confirmed this ad still existed at the publisher. So freshness is derived
 * from the supply itself — no new grant, no migration, no new authority.
 *
 * The operator distinction ("is the importer broken, or is the source just
 * quiet?") is deliberately NOT surfaced here. Train §4: do not expose raw
 * infrastructure jargon to workers. Both cases produce the same honest
 * worker-facing statement — these listings have not been re-confirmed
 * recently, so check the publisher.
 */

/** Deterministic, worker-facing supply states. */
export type SourceFreshnessState =
  | "current"
  | "delayed"
  | "stale"
  | "unavailable"
  | "unknown";

/**
 * Hours after the last confirmed refresh at which each state begins.
 *
 * An external job board is expected to re-confirm daily, so one missed day is
 * `delayed` (worth saying, not alarming) and two is `stale` (the worker should
 * check the publisher before relying on it). These are product thresholds, not
 * infrastructure SLAs — they describe how much a worker should trust the row.
 */
export const FRESHNESS_DELAYED_AFTER_HOURS = 24;
export const FRESHNESS_STALE_AFTER_HOURS = 48;

export interface SourceFreshnessV1 {
  readonly state: SourceFreshnessState;
  /** ISO instant of the newest confirmed refresh, when one is known. */
  readonly lastRefreshedAt: string | null;
  /** Whole hours since that refresh; null when unknown/unavailable. */
  readonly ageHours: number | null;
}

export interface ClassifyFreshnessInput {
  /** Newest `last_seen_at` across the supply in scope. */
  readonly lastRefreshedAt: string | null;
  readonly nowIso: string;
  /** True when the store itself could not be read (not provisioned/errored). */
  readonly unavailable?: boolean;
}

/**
 * Pure classifier. No clock, no database — `nowIso` is passed in so the same
 * input always yields the same state (and so tests can pin the boundary).
 */
export function classifySourceFreshness(
  input: ClassifyFreshnessInput,
): SourceFreshnessV1 {
  if (input.unavailable) {
    return { state: "unavailable", lastRefreshedAt: null, ageHours: null };
  }

  const { lastRefreshedAt, nowIso } = input;
  if (!lastRefreshedAt) {
    return { state: "unknown", lastRefreshedAt: null, ageHours: null };
  }

  const seen = Date.parse(lastRefreshedAt);
  const now = Date.parse(nowIso);
  // An unparseable or future timestamp is NOT quietly treated as fresh —
  // claiming freshness we cannot compute is the failure mode being fixed.
  if (Number.isNaN(seen) || Number.isNaN(now) || seen > now) {
    return { state: "unknown", lastRefreshedAt: null, ageHours: null };
  }

  const ageHours = Math.floor((now - seen) / 3_600_000);
  const state: SourceFreshnessState =
    ageHours >= FRESHNESS_STALE_AFTER_HOURS
      ? "stale"
      : ageHours >= FRESHNESS_DELAYED_AFTER_HOURS
        ? "delayed"
        : "current";

  return { state, lastRefreshedAt, ageHours };
}

/**
 * Whether the state warrants a visible notice on the board. `current` is the
 * only silent state — a banner on healthy supply is noise, and noise is how a
 * real warning stops being read.
 */
export function freshnessNeedsNotice(state: SourceFreshnessState): boolean {
  return state !== "current";
}
