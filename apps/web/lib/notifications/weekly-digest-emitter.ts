/**
 * WEEKLY DIGEST MATERIALIZER — pure half (value train 2, B2).
 *
 * The exactly-once-per-week property of the weekly personal digest rests on
 * two pure facts that live here, unit-tested with no IO:
 *
 *   1. `weeklyDigestEntityId` — a DETERMINISTIC uuid per ISO week, so the
 *      store's dedupe key `weekly_digest:<uuid>` + the UNIQUE (recipient,
 *      dedupe_key) constraint make the digest exactly-once per recipient per
 *      week across renders, races and instances.
 *   2. `hasCurrentWeekDigest` — the cheap skip check over the already-fetched
 *      durable feed, so a navigation does not attempt an insert when this
 *      week's row is already visible.
 *
 * The service-role EMIT half lives in `event-emitters.ts` — the one audited
 * home of durable-notification writers (chat-visibility-rls pins the
 * service-role caller inventory; a second emitter module would be a parallel
 * structure AND a new bypass to justify).
 *
 * Pure. No IO beyond hashing, no env, no server-only.
 */
import { isoWeekKey } from "../worker/weekly-intelligence-model";
import { deterministicEntityId } from "./deterministic-entity-id";

/**
 * Deterministic RFC-4122-shaped uuid for one ISO week (name-based, sha-256).
 *
 * The hashing itself moved to `deterministic-entity-id.ts` on 2026-09-14 so
 * the saved-search alert could use the SAME exactly-once arithmetic instead of
 * a second copy of it. Byte-for-byte identical output — the name fed in is
 * unchanged, so every uuid this has ever produced it still produces.
 */
export function weeklyDigestEntityId(dayIso: string): string {
  return deterministicEntityId(`weekly_digest:${isoWeekKey(dayIso)}`);
}

/** The minimal durable-feed row shape the skip check needs. */
export interface WeeklyDigestSkipRow {
  readonly type: string;
  readonly created_at: string;
}

/** True when the already-fetched feed holds a digest row from THIS ISO week. */
export function hasCurrentWeekDigest(
  rows: readonly WeeklyDigestSkipRow[],
  todayIso: string,
): boolean {
  const week = isoWeekKey(todayIso);
  return rows.some(
    (r) =>
      r.type === "event_weekly_digest" &&
      typeof r.created_at === "string" &&
      r.created_at.length >= 10 &&
      isoWeekKey(r.created_at.slice(0, 10)) === week,
  );
}
