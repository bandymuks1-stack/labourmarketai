import { createHash } from "node:crypto";

/**
 * A DETERMINISTIC uuid for a named fact — the thing that makes "exactly once"
 * a property of arithmetic rather than of luck.
 *
 * `notification_events` dedupes on UNIQUE (recipient, dedupe_key), and the key
 * is `<eventType>:<entityId>`. For an event with a real row behind it the
 * entity id is that row. For an event about a PERIOD — this week's digest,
 * this week's saved-search alert — there is no row, so the id is derived from
 * the name of the period instead. Two renders, two instances, a retry and a
 * race all compute the same uuid and the second insert is a no-op.
 *
 * Extracted (2026-09-14) from `weekly-digest-emitter.ts`, which had the only
 * copy. A second copy in the saved-search emitter would have been two
 * implementations of exactly-once, and the day they drifted one of them would
 * start sending twice.
 *
 * Name-based (sha-256), RFC-4122 shaped. Pure: no clock, no IO, no env.
 */
export function deterministicEntityId(name: string): string {
  const digest = createHash("sha256").update(name).digest();
  const b = Uint8Array.prototype.slice.call(digest, 0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // name-based version marker
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Buffer.from(b).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
