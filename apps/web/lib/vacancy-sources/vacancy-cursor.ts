/**
 * STREAM CURSOR — the checkpoint that makes ~1-minute polling honest.
 *
 * The provider's recommended cadence is: one snapshot, then poll the stream
 * about once a minute. Polling only stays cheap if each poll asks for
 * "everything since the last thing I saw". Without a cursor, a one-minute
 * poll is a full re-read sixty times an hour — which is precisely the load
 * an open, keyless, CC0 API asks you not to generate.
 *
 * The rules here are deliberately conservative:
 *   - the cursor only ever moves FORWARD (a late-arriving older record can
 *     never rewind it and cause a replay storm);
 *   - it is derived from the publisher's OWN timestamps, never from our
 *     clock, so a clock skew on our side cannot skip records;
 *   - an empty or unparseable batch leaves the cursor exactly where it was —
 *     losing the checkpoint is worse than re-reading one window;
 *   - it is nudged back by a small overlap before being used as a request
 *     bound, because a provider can publish two records in the same second
 *     and a strictly-greater-than boundary would drop the second one.
 *     Re-reading a few records is free: dedup collapses them.
 *
 * Pure module: no IO, no env, no fetch, no Date.now.
 */
import type { PublicVacancyV1 } from "./vacancy-contract";

/**
 * Overlap re-read, in milliseconds. One second is enough to cover
 * same-second publication at the boundary; anything larger just re-reads more
 * records that dedup will discard anyway.
 */
export const VACANCY_CURSOR_OVERLAP_MS = 1_000;

function parsed(iso: string | null | undefined): number | null {
  if (typeof iso !== "string" || iso.trim().length === 0) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The checkpoint after processing a batch: the newest publisher timestamp
 * seen, or the previous cursor when the batch adds nothing newer.
 *
 * Returns null only when there was no previous cursor AND the batch carried
 * no usable timestamp — an honest "we still have no checkpoint", which a
 * caller must treat as "do a snapshot", never as "start from zero".
 */
export function computeNextVacancyCursor(
  previousCursor: string | null,
  batch: readonly PublicVacancyV1[],
): string | null {
  const previousMs = parsed(previousCursor);
  let bestMs = previousMs;

  for (const vacancy of batch) {
    const ms = parsed(vacancy.publishedAt);
    if (ms === null) continue;
    if (bestMs === null || ms > bestMs) bestMs = ms;
  }

  if (bestMs === null) return null;
  // Never move backwards, even if a caller passes a batch of older records.
  if (previousMs !== null && bestMs < previousMs) return previousCursor;
  return new Date(bestMs).toISOString();
}

/**
 * The value to send as the stream request bound: the cursor minus the overlap
 * window. Returns null when there is no cursor — the caller must then run a
 * snapshot rather than request an unbounded stream.
 */
export function cursorRequestBound(cursor: string | null): string | null {
  const ms = parsed(cursor);
  if (ms === null) return null;
  return new Date(ms - VACANCY_CURSOR_OVERLAP_MS).toISOString();
}
