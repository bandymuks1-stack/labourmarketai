/**
 * Profile freshness (Wagon 1 — stale-profile handling on discovery).
 *
 * Buckets a worker profile by its best REAL timestamp (workers.updated_at,
 * an applied production column; created_at as the fallback when updated_at
 * is somehow absent):
 *
 *   active  — touched within the last 30 days
 *   recent  — touched within the last 90 days
 *   dormant — older than 90 days (or no usable timestamp at all)
 *
 * The bucket is computed at query time, shown honestly on the scouting card
 * (same vocabulary as components/visual/worker-card.tsx lastActiveBucket),
 * and DEMOTES dormant profiles in the ranking — it never hides them. No
 * timestamp is ever fabricated: an unparseable value lands in "dormant"
 * (fail conservative), never in "active".
 *
 * Pure, deterministic, unit-tested.
 */

export type LastActiveBucket = "active" | "recent" | "dormant";

export const FRESHNESS_ACTIVE_MAX_DAYS = 30;
export const FRESHNESS_RECENT_MAX_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bucket a profile timestamp. Null/invalid/future-only garbage → dormant. */
export function lastActiveBucket(
  timestampIso: string | null | undefined,
  now: Date = new Date(),
): LastActiveBucket {
  if (typeof timestampIso !== "string" || timestampIso.trim() === "") {
    return "dormant";
  }
  const ts = Date.parse(timestampIso);
  if (!Number.isFinite(ts)) return "dormant";
  const ageDays = (now.getTime() - ts) / DAY_MS;
  // A clock-skewed slightly-future timestamp is simply "just touched".
  if (ageDays <= FRESHNESS_ACTIVE_MAX_DAYS) return "active";
  if (ageDays <= FRESHNESS_RECENT_MAX_DAYS) return "recent";
  return "dormant";
}

/** Ranking demotion weight: dormant sinks below active/recent, which keep
 *  their existing match-quality order relative to each other. */
export function freshnessDemotionRank(bucket: LastActiveBucket): number {
  return bucket === "dormant" ? 1 : 0;
}
