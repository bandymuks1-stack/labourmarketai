import { deterministicEntityId } from "./deterministic-entity-id";

/**
 * MESSAGE BURST COALESCING — one bell row per thread per window.
 *
 * `notification_events` dedupes on UNIQUE (recipient, dedupe_key) and the key
 * is `<eventType>:<entityId>`. A message has no durable entity of its own that
 * a notification should be about (the thread is the thing the reader opens),
 * and keying on the bare conversation id would announce a thread exactly ONCE
 * EVER — a reply a week later would be silent. So the entity id is derived
 * from the thread AND a time bucket: every message in the same bucket maps to
 * the same uuid, the store refuses the second insert, and a burst of ten
 * messages is one row. The next bucket is a new fact.
 *
 * The window is deliberately short enough that "they answered again this
 * afternoon" still lands, long enough that a back-and-forth never becomes a
 * stream of bells. Pure: no clock, no IO — `now` is a parameter.
 */
export const MESSAGE_COALESCE_WINDOW_MS = 30 * 60 * 1000;

export function messageReceivedEntityId(
  conversationId: string,
  nowMs: number,
  windowMs: number = MESSAGE_COALESCE_WINDOW_MS,
): string {
  const bucket = Math.floor(nowMs / windowMs);
  return deterministicEntityId(`message_received:${conversationId}:${bucket}`);
}

/** One row per (entry, decision): re-sending the same outcome is a no-op, a
 *  different outcome (changes requested, later approved) is a new fact. */
export function journalReviewEntityId(
  entryId: string,
  decision: string,
): string {
  return deterministicEntityId(`journal_review_decided:${entryId}:${decision}`);
}
