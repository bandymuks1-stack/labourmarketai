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
