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
import { createHash } from "node:crypto";
import { isoWeekKey } from "../worker/weekly-intelligence-model";

/**
 * Deterministic RFC-4122-shaped uuid for one ISO week (name-based, sha-256).
 */
export function weeklyDigestEntityId(dayIso: string): string {
  const digest = createHash("sha256")
    .update(`weekly_digest:${isoWeekKey(dayIso)}`)
    .digest();
  const b = Uint8Array.prototype.slice.call(digest, 0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // name-based version marker
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Buffer.from(b).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
