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

/**
 * An ISO-8601 instant, and nothing else.
 *
 * `Date.parse` alone is NOT safe here, because it is deliberately lenient:
 * `Date.parse("record-offset:5000")` does not fail — it reads `5000` as a YEAR
 * and returns 4999-12-31. A checkpoint value of the wrong KIND would therefore
 * have been silently accepted as a valid instant, and a delta channel handed
 * one would ask the publisher for changes since the year 4999: a request that
 * succeeds, returns nothing, and starves the source forever without ever
 * looking like a failure.
 *
 * Matching the shape first means an unrecognised value becomes "no checkpoint"
 * — which every caller already treats as a reason to refuse or to restart,
 * never as a reason to guess.
 */
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

function parsed(iso: string | null | undefined): number | null {
  if (typeof iso !== "string") return null;
  const trimmed = iso.trim();
  if (trimmed.length === 0 || !ISO_INSTANT.test(trimmed)) return null;
  const ms = Date.parse(trimmed);
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

// ── RECORD-OFFSET CHECKPOINT ────────────────────────────────────────────────
/**
 * A streamed snapshot has no timestamp to checkpoint on. It is one ordered
 * body of "everything live right now", far larger than a single session may
 * consume, and the publisher offers no server-side offset parameter. So the
 * checkpoint for that channel is a RECORD INDEX: how many lines of the body
 * have already been crossed.
 *
 * It shares the `cursor_value` column with the timestamp checkpoints, which
 * the schema deliberately treats as an opaque publisher token. Mixing two
 * meanings in one column is only safe if they cannot be confused for each
 * other, so the offset carries an explicit prefix and:
 *
 *   - `decodeRecordOffsetCursor` returns null for a timestamp cursor, and
 *   - `cursorRequestBound` / `computeNextVacancyCursor` already return null
 *     for a prefixed offset (it is not a parseable date).
 *
 * Both directions therefore fail CLOSED — a channel handed the wrong kind of
 * checkpoint refuses to run rather than walking from a garbage position.
 */
export const VACANCY_RECORD_OFFSET_PREFIX = "record-offset:";

/** Encode a record index as the stored checkpoint. Negative and non-finite
 *  values collapse to 0 — a walk restarts rather than seeking nowhere. */
export function encodeRecordOffsetCursor(offset: number): string {
  const safe =
    Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  return `${VACANCY_RECORD_OFFSET_PREFIX}${safe}`;
}

/**
 * The record index a stored checkpoint represents, or null when the value is
 * absent, is a timestamp, or is malformed. Null means "start from the
 * beginning", which for a full snapshot is always a correct thing to do.
 */
export function decodeRecordOffsetCursor(cursor: string | null): number | null {
  if (typeof cursor !== "string") return null;
  const trimmed = cursor.trim();
  if (!trimmed.startsWith(VACANCY_RECORD_OFFSET_PREFIX)) return null;
  const raw = trimmed.slice(VACANCY_RECORD_OFFSET_PREFIX.length);
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

// ── CONTINUATION-TOKEN CHECKPOINT ───────────────────────────────────────────
/**
 * A `cursor` channel (a feed that hands back the token naming its next page)
 * checkpoints on the publisher's OWN continuation token. It shares the same
 * opaque `cursor_value` column as the two checkpoints above, so it carries
 * its own prefix for the same reason the record offset does: the three kinds
 * must never be confusable. `decodeContinuationTokenCursor` returns null for
 * a timestamp or an offset, and both older decoders return null for a
 * prefixed token — every direction fails CLOSED.
 *
 * The token is bounded because it is stored and echoed back on the wire:
 * a publisher (or a corrupted row) handing back a multi-kilobyte "token"
 * must not become a multi-kilobyte query string. Added 2026-09-22 for the
 * NAV scaffold; no provider is walked this way until that gate opens.
 */
export const VACANCY_CONTINUATION_TOKEN_PREFIX = "continuation-token:";
/** Longest token accepted, in characters. */
export const VACANCY_CONTINUATION_TOKEN_MAX_CHARS = 512;

/** Only characters a URL-safe token can carry. Anything else is refused —
 *  a token is never a place to smuggle a path, a scheme or whitespace. */
const CONTINUATION_TOKEN_SHAPE = /^[A-Za-z0-9._~:-]+$/;

/** Encode a publisher continuation token as the stored checkpoint, or null
 *  when the value is empty, over-long or not token-shaped. */
export function encodeContinuationTokenCursor(token: string): string | null {
  const trimmed = token.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > VACANCY_CONTINUATION_TOKEN_MAX_CHARS ||
    !CONTINUATION_TOKEN_SHAPE.test(trimmed)
  ) {
    return null;
  }
  return `${VACANCY_CONTINUATION_TOKEN_PREFIX}${trimmed}`;
}

/** The continuation token a stored checkpoint carries, or null when the value
 *  is absent, is a timestamp, is an offset, or is malformed. Null means
 *  "walk from the head of the feed" — the cold start a feed is designed for. */
export function decodeContinuationTokenCursor(
  cursor: string | null,
): string | null {
  if (typeof cursor !== "string") return null;
  const trimmed = cursor.trim();
  if (!trimmed.startsWith(VACANCY_CONTINUATION_TOKEN_PREFIX)) return null;
  const raw = trimmed.slice(VACANCY_CONTINUATION_TOKEN_PREFIX.length);
  if (
    raw.length === 0 ||
    raw.length > VACANCY_CONTINUATION_TOKEN_MAX_CHARS ||
    !CONTINUATION_TOKEN_SHAPE.test(raw)
  ) {
    return null;
  }
  return raw;
}

/**
 * Read the next continuation token off a response body at the descriptor's
 * declared path. Returns null when the path is absent, the value is not a
 * non-empty string, or it fails the token shape — all of which mean "no
 * further page", never an error. Pure and total over `unknown`.
 */
export function readContinuationToken(
  body: unknown,
  path: readonly string[],
): string | null {
  let node: unknown = body;
  for (const key of path) {
    if (node === null || typeof node !== "object" || Array.isArray(node)) {
      return null;
    }
    node = (node as Record<string, unknown>)[key];
  }
  if (typeof node !== "string") return null;
  const trimmed = node.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > VACANCY_CONTINUATION_TOKEN_MAX_CHARS ||
    !CONTINUATION_TOKEN_SHAPE.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

// ── TIME-WINDOW WALK ────────────────────────────────────────────────────────
/**
 * Why a stream must be walked in SLICES rather than asked for in one go.
 *
 * A delta endpoint that takes only a START bound answers "everything changed
 * since then" in ONE un-paginated response. That response grows with the gap
 * since the last successful run, so a transport byte cap turns into a trap:
 * once the response exceeds the cap the run fails, a failed run correctly
 * refuses to advance the checkpoint, and the next run therefore asks for an
 * even WIDER window. The failure feeds itself and the source never recovers
 * on its own. That is exactly what happened to the Swedish stream between
 * 2026-08-09 and 2026-08-11 (a 31.9 MiB answer against a 16 MiB cap).
 *
 * The cure is to make every request bounded on BOTH sides and to walk the
 * backlog forward one affordable slice at a time. A slice that succeeds moves
 * the checkpoint by exactly its own width, so progress is monotonic and a
 * multi-day backlog drains over one or more sessions instead of deadlocking.
 */
export interface VacancyWindowV1 {
  /** Inclusive start of the slice. */
  readonly startIso: string;
  /** Exclusive end of the slice — also the checkpoint once it is consumed. */
  readonly endIso: string;
}

export interface VacancyWindowPlanV1 {
  readonly windows: readonly VacancyWindowV1[];
  /**
   * True when the final planned window reaches the present (minus the safety
   * lag) — i.e. this session would drain the whole backlog. False means the
   * per-session window cap truncated the plan and a further run is needed.
   * Reported rather than hidden: a silently truncated catch-up reads as
   * "caught up" and that is how stale supply goes unnoticed.
   */
  readonly reachedPresent: boolean;
}

/**
 * Slice `[from, now - safetyLag)` into windows of at most `widthSeconds`,
 * capped at `maxWindows`.
 *
 * `safetyLagSeconds` keeps the newest edge of the walk away from the present:
 * the publisher's own write is not instantaneous, and a window whose end is
 * "now" can close over a record that lands a moment later. Since the window
 * end becomes the checkpoint, that record would be skipped forever. Trailing
 * the present by a lag costs one extra slice and removes the whole class.
 *
 * Pure: no clocks, no IO — `nowIso` is injected like every other clock here.
 */
export function planVacancyWindows(args: {
  readonly fromIso: string | null;
  readonly nowIso: string;
  readonly widthSeconds: number;
  readonly safetyLagSeconds: number;
  readonly maxWindows: number;
}): VacancyWindowPlanV1 {
  const fromMs = parsed(args.fromIso);
  const nowMs = parsed(args.nowIso);
  if (fromMs === null || nowMs === null) {
    return { windows: [], reachedPresent: false };
  }

  const ceilingMs = nowMs - Math.max(0, args.safetyLagSeconds) * 1_000;
  // Already level with the present: nothing to walk, and nothing is pending.
  if (ceilingMs <= fromMs) return { windows: [], reachedPresent: true };

  const widthMs = Math.max(1, Math.floor(args.widthSeconds)) * 1_000;
  const maxWindows = Math.max(0, Math.floor(args.maxWindows));
  const windows: VacancyWindowV1[] = [];
  let edgeMs = fromMs;

  while (edgeMs < ceilingMs && windows.length < maxWindows) {
    const endMs = Math.min(edgeMs + widthMs, ceilingMs);
    windows.push({
      startIso: new Date(edgeMs).toISOString(),
      endIso: new Date(endMs).toISOString(),
    });
    edgeMs = endMs;
  }

  return { windows, reachedPresent: edgeMs >= ceilingMs };
}
