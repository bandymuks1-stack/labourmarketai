/**
 * JSON-LINES READER — the bounded, incremental way to consume a response that
 * is far too large to hold in memory.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * A cold start needs the publisher's SNAPSHOT: every ad currently live. For
 * Sweden that is one response of 389.94 MiB — 37,014 ads, ~11 KB each,
 * 313 s on the wire (measured 2026-08-11 against
 * jobstream.api.jobtechdev.se/v2/snapshot). The pipeline's buffered transport
 * cap is 16 MiB, so the snapshot is not marginally too big: it is 24× too big,
 * and no retry, backoff or patience would ever have changed that.
 *
 * Raising the shared cap was the one fix NOT available. That cap is what keeps
 * every provider's buffered path from being handed an unbounded body, so
 * widening it to fit Sweden would weaken Latvia, Belgium and every source
 * after them. The bound is correct; the TRANSPORT was wrong.
 *
 * The publisher already offers the right transport. `/v2/snapshot` and
 * `/v2/stream` both advertise `application/jsonl` — one complete ad per line —
 * so the body can be consumed a record at a time and never assembled. This
 * module is that consumer, and it is the reason a 390 MiB snapshot can be read
 * inside a memory bound of a few hundred kilobytes.
 *
 * ── WHAT THIS GUARANTEES ───────────────────────────────────────────────────
 *
 *   - it NEVER holds the whole body: only the current partial line is
 *     buffered, and that buffer is itself capped (`maxLineBytes`), so a
 *     publisher that answers one endless line without a newline is refused
 *     rather than allowed to exhaust memory;
 *   - it stops on a BUDGET — records, consumed bytes, or skipped bytes — and
 *     says which one stopped it, so a caller can never mistake "we stopped
 *     early" for "that was everything";
 *   - `completedStream` is true ONLY when the publisher actually ended the
 *     body. Every other stop is explicitly incomplete. This is the single
 *     fact a checkpoint may be advanced on;
 *   - one malformed line is counted and skipped, never fatal — the same
 *     doctrine the record parsers already follow, because one bad ad must not
 *     cost the other 37,013;
 *   - `nextOffset` counts every line CROSSED, including malformed ones.
 *     Excluding them would re-read the same bad line forever.
 *
 * ── RESUMPTION ─────────────────────────────────────────────────────────────
 *
 * The endpoint has no server-side paging: there is no `offset` parameter to
 * send, and the swagger contract (read 2026-08-11) offers none. So resumption
 * is done on OUR side, by skipping `skipRecords` lines before emitting. The
 * skipped prefix still crosses the wire — that is a real cost and it is bounded
 * by `maxSkipBytes` rather than hidden — but skipping is free of memory and of
 * JSON parsing: skipped lines are counted by scanning for newline BYTES and are
 * never decoded into strings or objects.
 *
 * Pure module: no IO, no env, no fetch, no Date.now. It consumes an async
 * iterable of byte chunks, which is what makes it fully testable without a
 * network — the adapter supplies the real one.
 */

/** Byte value of "\n". Lines are split on this and nothing else: a lone \r is
 *  trimmed off the end of a line rather than treated as a terminator, because
 *  a bare CR inside a JSON string is legal and must not split a record. */
const NEWLINE = 0x0a;

export type VacancyJsonLinesStopReason =
  /** The publisher ended the body. The ONLY complete outcome. */
  | "end_of_stream"
  /** We took the number of records we were asked for; more remain. */
  | "record_budget"
  /** The consumed-byte budget was spent; more remain. */
  | "byte_budget"
  /** The skip scan spent its byte budget before reaching the offset. */
  | "skip_budget"
  /** One line exceeded `maxLineBytes` — refused rather than buffered. */
  | "line_too_long";

export interface VacancyJsonLinesBudgetV1 {
  /**
   * Lines to cross before emitting anything — the resume point. 0 starts at
   * the beginning. A skip that runs past the end of a SHORTER body is not an
   * error: it simply ends the stream having emitted nothing, which correctly
   * reports the walk as complete.
   */
  readonly skipRecords: number;
  /** Most records to emit in this session. */
  readonly maxRecords: number;
  /** Byte budget for the CONSUMED portion (everything after the skip). */
  readonly maxBytes: number;
  /** Byte budget for the SKIPPED prefix. Separate because skipping costs
   *  bandwidth but neither memory nor parsing, so the two deserve different
   *  ceilings rather than one number that has to be wrong for both. */
  readonly maxSkipBytes: number;
  /** Longest single line tolerated, in bytes. Memory safety, not policy. */
  readonly maxLineBytes: number;
}

export interface VacancyJsonLinesResultV1 {
  /** Decoded records, in publisher order. Never more than `maxRecords`. */
  readonly records: readonly unknown[];
  /** Total bytes pulled off the stream, skip included. */
  readonly bytesRead: number;
  /** Bytes belonging to the skipped prefix. */
  readonly bytesSkipped: number;
  /** Non-empty lines crossed while skipping. */
  readonly recordsSkipped: number;
  /** Lines that were not valid JSON. Counted, skipped, never fatal. */
  readonly malformedLines: number;
  readonly stopReason: VacancyJsonLinesStopReason;
  /**
   * True ONLY when the publisher ended the body. A caller may treat the walk
   * as finished on this and on nothing else.
   */
  readonly completedStream: boolean;
  /**
   * Absolute index of the next unread line — the resume point for the next
   * session. Counts every line crossed: skipped, emitted AND malformed.
   */
  readonly nextOffset: number;
}

/**
 * Read a line-delimited JSON stream under every budget above.
 *
 * `chunks` is any async iterable of byte chunks — a `ReadableStream` reader
 * loop, a fixture array, whatever. The reader never closes it; the caller owns
 * the stream and is responsible for cancelling it once this returns, which is
 * what makes an early stop actually stop the transfer.
 */
export async function readVacancyJsonLines(
  chunks: AsyncIterable<Uint8Array>,
  budget: VacancyJsonLinesBudgetV1,
): Promise<VacancyJsonLinesResultV1> {
  const skipTarget = Math.max(0, Math.floor(budget.skipRecords));
  const maxRecords = Math.max(0, Math.floor(budget.maxRecords));
  const maxBytes = Math.max(0, Math.floor(budget.maxBytes));
  const maxSkipBytes = Math.max(0, Math.floor(budget.maxSkipBytes));
  const maxLineBytes = Math.max(1, Math.floor(budget.maxLineBytes));

  const records: unknown[] = [];
  let bytesRead = 0;
  let bytesSkipped = 0;
  let recordsSkipped = 0;
  let malformedLines = 0;
  /** Absolute index of the next line to be crossed. */
  let lineIndex = 0;
  let stopReason: VacancyJsonLinesStopReason = "end_of_stream";
  let stopped = false;

  /**
   * The partial line currently being assembled, held as raw BYTES. Bytes
   * rather than a string because a UTF-8 character may straddle a chunk
   * boundary, and decoding per-chunk would corrupt Swedish å/ä/ö sitting on
   * that seam. Each line is decoded exactly once, when it is complete.
   */
  let carry: Uint8Array = new Uint8Array(0);

  const decoder = new TextDecoder("utf8", { fatal: false });

  /** Append to the carry buffer, refusing a line that grew past the cap. */
  const appendCarry = (part: Uint8Array): boolean => {
    if (carry.length + part.length > maxLineBytes) return false;
    const next = new Uint8Array(carry.length + part.length);
    next.set(carry, 0);
    next.set(part, carry.length);
    carry = next;
    return true;
  };

  /**
   * Handle one COMPLETE line. Returns false when the budget says stop.
   * A blank line is ignored entirely and does not advance the index — JSONL
   * permits trailing newlines and they are not records.
   */
  const takeLine = (line: Uint8Array): boolean => {
    // Trim a trailing CR so CRLF bodies parse identically to LF ones.
    const end = line.length > 0 && line[line.length - 1] === 0x0d
      ? line.length - 1
      : line.length;
    if (end === 0) return true;

    // Cheap blank check: a line of only ASCII whitespace is not a record.
    let allSpace = true;
    for (let i = 0; i < end; i += 1) {
      const b = line[i];
      if (b !== 0x20 && b !== 0x09 && b !== 0x0d) {
        allSpace = false;
        break;
      }
    }
    if (allSpace) return true;

    if (lineIndex < skipTarget) {
      // Skipped lines are never decoded and never parsed.
      recordsSkipped += 1;
      lineIndex += 1;
      return true;
    }

    // Checked BEFORE consuming, so `record_budget` is reported only when
    // another line was genuinely waiting. A body that ends exactly on the
    // budget therefore reports `end_of_stream` and counts as complete, which
    // is the truth. `lineIndex` has not moved, so it still points at this
    // unread line — the correct resume point.
    if (records.length >= maxRecords) {
      stopReason = "record_budget";
      return false;
    }

    lineIndex += 1;
    const text = decoder.decode(line.subarray(0, end));
    try {
      records.push(JSON.parse(text));
    } catch {
      // Counted and crossed. `lineIndex` already moved, so a permanently
      // malformed line can never trap the walk on a replay.
      malformedLines += 1;
    }
    return true;
  };

  outer: for await (const chunk of chunks) {
    if (stopped) break;
    bytesRead += chunk.byteLength;
    if (lineIndex < skipTarget) bytesSkipped += chunk.byteLength;

    // Budgets are checked on the boundary the bytes belong to. While still
    // skipping, spend the skip budget; once emitting, spend the read budget.
    // The split is CHUNK-granular: the one chunk containing the skip/emit
    // transition is charged wholly to the skip side. That is a rounding error
    // of at most one chunk against budgets measured in hundreds of megabytes,
    // and erring toward the skip budget is the safe direction — it can only
    // stop a session early, never let one run past its read budget.
    if (lineIndex < skipTarget && bytesSkipped > maxSkipBytes) {
      stopReason = "skip_budget";
      stopped = true;
      break;
    }
    if (lineIndex >= skipTarget && bytesRead - bytesSkipped > maxBytes) {
      stopReason = "byte_budget";
      stopped = true;
      break;
    }

    let start = 0;
    for (let i = 0; i < chunk.length; i += 1) {
      if (chunk[i] !== NEWLINE) continue;
      const segment = chunk.subarray(start, i);
      start = i + 1;

      let line: Uint8Array;
      if (carry.length === 0) {
        line = segment;
      } else {
        if (!appendCarry(segment)) {
          stopReason = "line_too_long";
          stopped = true;
          break outer;
        }
        line = carry;
        carry = new Uint8Array(0);
      }

      if (!takeLine(line)) {
        stopped = true;
        break outer;
      }
    }

    // Whatever followed the last newline in this chunk is a partial line.
    if (start < chunk.length) {
      if (!appendCarry(chunk.subarray(start))) {
        stopReason = "line_too_long";
        stopped = true;
        break;
      }
    }
  }

  // A body whose final record has no trailing newline still ends in a real
  // record. Dropping it would silently lose one ad per snapshot.
  if (!stopped && carry.length > 0) {
    takeLine(carry);
    carry = new Uint8Array(0);
  }

  const completedStream = !stopped && stopReason === "end_of_stream";

  return {
    records,
    bytesRead,
    bytesSkipped,
    recordsSkipped,
    malformedLines,
    stopReason,
    completedStream,
    // When the publisher ended the body, the walk is finished and the next
    // session starts a fresh reconciliation from the beginning.
    nextOffset: completedStream ? 0 : lineIndex,
  };
}
