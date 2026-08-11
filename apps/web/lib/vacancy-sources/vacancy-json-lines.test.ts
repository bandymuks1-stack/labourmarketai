/**
 * JSON-LINES READER — bounded, incremental, resumable.
 *
 * The cases here are the ones that actually broke, or would break, a 390 MiB
 * cold start: a body far past every budget, a record split across chunk
 * boundaries, a multi-byte character split across a chunk boundary, a
 * malformed line among good ones, and the difference between "the publisher
 * ended the body" and "we stopped early" — which is the single fact the
 * checkpoint is allowed to move on.
 */
import { describe, it, expect } from "vitest";
import {
  readVacancyJsonLines,
  type VacancyJsonLinesBudgetV1,
} from "./vacancy-json-lines";

const enc = new TextEncoder();

/** A generous budget: nothing here is the thing under test. */
const OPEN: VacancyJsonLinesBudgetV1 = {
  skipRecords: 0,
  maxRecords: 1_000_000,
  maxBytes: 1_000_000_000,
  maxSkipBytes: 1_000_000_000,
  maxLineBytes: 1_000_000,
};

/** Feed a whole body as ONE chunk. */
async function* one(body: string): AsyncIterable<Uint8Array> {
  yield enc.encode(body);
}

/** Feed a body split into fixed-size byte chunks — the realistic shape. */
async function* sliced(body: string, size: number): AsyncIterable<Uint8Array> {
  const bytes = enc.encode(body);
  for (let i = 0; i < bytes.length; i += size) {
    yield bytes.subarray(i, Math.min(i + size, bytes.length));
  }
}

/** N well-formed ad-shaped lines. */
function lines(n: number, from = 0): string {
  const out: string[] = [];
  for (let i = from; i < from + n; i += 1) {
    out.push(JSON.stringify({ id: `ad-${i}`, headline: `Job ${i}` }));
  }
  return out.join("\n") + "\n";
}

describe("readVacancyJsonLines — the ordinary path", () => {
  it("reads every record from a small body and reports it complete", async () => {
    const res = await readVacancyJsonLines(one(lines(3)), OPEN);
    expect(res.records).toHaveLength(3);
    expect(res.records[0]).toEqual({ id: "ad-0", headline: "Job 0" });
    expect(res.stopReason).toBe("end_of_stream");
    expect(res.completedStream).toBe(true);
    expect(res.malformedLines).toBe(0);
    // A finished walk resets, so the next session reconciles from the top.
    expect(res.nextOffset).toBe(0);
  });

  it("an empty body is a complete, empty walk — not a failure", async () => {
    const res = await readVacancyJsonLines(one(""), OPEN);
    expect(res.records).toEqual([]);
    expect(res.completedStream).toBe(true);
    expect(res.stopReason).toBe("end_of_stream");
  });

  it("keeps the final record when the body has no trailing newline", async () => {
    // Losing this one costs exactly one ad per snapshot, silently.
    const body = lines(2).trimEnd();
    const res = await readVacancyJsonLines(one(body), OPEN);
    expect(res.records).toHaveLength(2);
    expect(res.completedStream).toBe(true);
  });

  it("ignores blank and whitespace-only lines without counting them", async () => {
    const body = `${JSON.stringify({ id: "a" })}\n\n   \n${JSON.stringify({ id: "b" })}\n`;
    const res = await readVacancyJsonLines(one(body), OPEN);
    expect(res.records).toHaveLength(2);
    expect(res.malformedLines).toBe(0);
  });

  it("handles CRLF bodies identically to LF ones", async () => {
    const body = `${JSON.stringify({ id: "a" })}\r\n${JSON.stringify({ id: "b" })}\r\n`;
    const res = await readVacancyJsonLines(one(body), OPEN);
    expect(res.records).toEqual([{ id: "a" }, { id: "b" }]);
  });
});

describe("readVacancyJsonLines — chunk boundaries", () => {
  it("reassembles records split across many chunks", async () => {
    // 7 bytes per chunk shreds every record across several chunks.
    const res = await readVacancyJsonLines(sliced(lines(25), 7), OPEN);
    expect(res.records).toHaveLength(25);
    expect(res.records[24]).toEqual({ id: "ad-24", headline: "Job 24" });
    expect(res.completedStream).toBe(true);
  });

  it("does not corrupt a multi-byte character split across a chunk boundary", async () => {
    // Swedish text is the whole point of this source; decoding per-chunk
    // instead of per-line turns "Göteborg" into replacement characters.
    const body = `${JSON.stringify({ city: "Göteborg", role: "Målare — Växjö" })}\n`;
    const bytes = enc.encode(body);
    // Find a byte index that lands INSIDE the two-byte "ö".
    const split = bytes.indexOf(0xc3) + 1;
    expect(split).toBeGreaterThan(0);
    async function* halves(): AsyncIterable<Uint8Array> {
      yield bytes.subarray(0, split);
      yield bytes.subarray(split);
    }
    const res = await readVacancyJsonLines(halves(), OPEN);
    expect(res.records).toEqual([{ city: "Göteborg", role: "Målare — Växjö" }]);
  });

  it("NEGATIVE CONTROL: decoding per chunk instead of per line does corrupt it", async () => {
    // Proves the test above is load-bearing rather than trivially true.
    const body = JSON.stringify({ city: "Göteborg" });
    const bytes = enc.encode(body);
    const split = bytes.indexOf(0xc3) + 1;
    const naive =
      new TextDecoder("utf8").decode(bytes.subarray(0, split)) +
      new TextDecoder("utf8").decode(bytes.subarray(split));
    expect(naive).not.toBe(body);
    expect(naive).toContain("�");
  });
});

describe("readVacancyJsonLines — budgets stop the walk honestly", () => {
  it("stops on the record budget and reports the walk INCOMPLETE", async () => {
    const res = await readVacancyJsonLines(one(lines(100)), {
      ...OPEN,
      maxRecords: 10,
    });
    expect(res.records).toHaveLength(10);
    expect(res.stopReason).toBe("record_budget");
    // The single most important assertion in this file: a truncated read must
    // never look like a finished one, because the checkpoint moves on it.
    expect(res.completedStream).toBe(false);
    expect(res.nextOffset).toBe(10);
  });

  it("a body ending exactly on the record budget is COMPLETE", async () => {
    const res = await readVacancyJsonLines(one(lines(10)), {
      ...OPEN,
      maxRecords: 10,
    });
    expect(res.records).toHaveLength(10);
    expect(res.stopReason).toBe("end_of_stream");
    expect(res.completedStream).toBe(true);
  });

  it("stops on the consumed-byte budget", async () => {
    const res = await readVacancyJsonLines(sliced(lines(500), 256), {
      ...OPEN,
      maxBytes: 1_000,
    });
    expect(res.stopReason).toBe("byte_budget");
    expect(res.completedStream).toBe(false);
    expect(res.records.length).toBeGreaterThan(0);
    expect(res.records.length).toBeLessThan(500);
  });

  it("refuses one endless line rather than buffering it", async () => {
    // A publisher answering a single unterminated line is exactly the shape
    // that would exhaust memory. 200 KB of line against a 1 KB cap.
    const endless = "x".repeat(200_000);
    const res = await readVacancyJsonLines(sliced(endless, 4_096), {
      ...OPEN,
      maxLineBytes: 1_024,
    });
    expect(res.stopReason).toBe("line_too_long");
    expect(res.completedStream).toBe(false);
    expect(res.records).toEqual([]);
  });

  it("NEGATIVE CONTROL: the same body under a large line cap is not refused", async () => {
    const endless = `${JSON.stringify({ blob: "x".repeat(200_000) })}\n`;
    const res = await readVacancyJsonLines(sliced(endless, 4_096), {
      ...OPEN,
      maxLineBytes: 1_000_000,
    });
    expect(res.stopReason).toBe("end_of_stream");
    expect(res.records).toHaveLength(1);
  });
});

describe("readVacancyJsonLines — malformed data never sinks the batch", () => {
  it("counts a bad line, keeps the good ones, and crosses it", async () => {
    const body =
      `${JSON.stringify({ id: "a" })}\n` +
      `{ this is not json \n` +
      `${JSON.stringify({ id: "c" })}\n`;
    const res = await readVacancyJsonLines(one(body), OPEN);
    expect(res.records).toEqual([{ id: "a" }, { id: "c" }]);
    expect(res.malformedLines).toBe(1);
    expect(res.completedStream).toBe(true);
  });

  it("a malformed line still advances the resume offset", async () => {
    // Otherwise a permanently bad line traps the walk on an infinite replay.
    const body = `{ bad \n${JSON.stringify({ id: "b" })}\n${JSON.stringify({ id: "c" })}\n`;
    const res = await readVacancyJsonLines(one(body), {
      ...OPEN,
      maxRecords: 1,
    });
    expect(res.malformedLines).toBe(1);
    expect(res.records).toEqual([{ id: "b" }]);
    expect(res.stopReason).toBe("record_budget");
    // Two lines crossed (one bad, one good) — resume at index 2, not 1.
    expect(res.nextOffset).toBe(2);
  });

  it("a large whole-array body is refused, never read as an empty snapshot", async () => {
    // The legacy /snapshot shape: one 390 MiB array with no newline in it.
    // Because there is no line boundary, the whole body would have to be
    // buffered — so the line cap refuses it. The alternative (returning zero
    // records) would be indistinguishable from "Sweden has no vacancies".
    const body = JSON.stringify(
      Array.from({ length: 200 }, (_, i) => ({ id: `ad-${i}` })),
    );
    const res = await readVacancyJsonLines(sliced(body, 512), {
      ...OPEN,
      maxLineBytes: 1_024,
    });
    expect(res.records).toEqual([]);
    expect(res.stopReason).toBe("line_too_long");
    expect(res.completedStream).toBe(false);
  });

  it("a SMALL whole-array body decodes as one array record — which the adapter's content-type check is what actually prevents", async () => {
    // Documented rather than hidden: the reader is format-agnostic, so a body
    // small enough to fit one line parses as a single record that happens to
    // be an array. It is the adapter's `application/jsonl` content-type
    // refusal — not this module — that stops the deprecated array endpoint
    // from ever reaching here. Pinning the real behaviour keeps the division
    // of responsibility honest.
    const body = JSON.stringify([{ id: "a" }, { id: "b" }]);
    const res = await readVacancyJsonLines(one(body), OPEN);
    expect(res.records).toHaveLength(1);
    expect(Array.isArray(res.records[0])).toBe(true);
    // And downstream it is still not mistaken for two ads: the record parsers
    // reject a non-object payload with a stable reason.
  });
});

describe("readVacancyJsonLines — resumption", () => {
  it("skips a prefix without parsing it and emits the next slice", async () => {
    const res = await readVacancyJsonLines(one(lines(100)), {
      ...OPEN,
      skipRecords: 40,
      maxRecords: 10,
    });
    expect(res.recordsSkipped).toBe(40);
    expect(res.records).toHaveLength(10);
    expect(res.records[0]).toEqual({ id: "ad-40", headline: "Job 40" });
    expect(res.nextOffset).toBe(50);
    expect(res.completedStream).toBe(false);
  });

  it("three sessions walk a body end to end with no gap and no overlap", async () => {
    const body = lines(25);
    const seen: string[] = [];
    let offset = 0;
    for (let session = 0; session < 3; session += 1) {
      const res = await readVacancyJsonLines(one(body), {
        ...OPEN,
        skipRecords: offset,
        maxRecords: 10,
      });
      for (const r of res.records) seen.push((r as { id: string }).id);
      if (res.completedStream) {
        offset = 0;
        break;
      }
      offset = res.nextOffset;
    }
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(seen[0]).toBe("ad-0");
    expect(seen[24]).toBe("ad-24");
    // Drained: the walk reset, so the next run reconciles from the top.
    expect(offset).toBe(0);
  });

  it("skipping past the end of a SHRUNKEN body completes with nothing", async () => {
    // The snapshot shrinks between sessions; the offset outruns it. That is a
    // finished walk, not an error and not a stall.
    const res = await readVacancyJsonLines(one(lines(5)), {
      ...OPEN,
      skipRecords: 500,
      maxRecords: 10,
    });
    expect(res.records).toEqual([]);
    expect(res.recordsSkipped).toBe(5);
    expect(res.completedStream).toBe(true);
    expect(res.nextOffset).toBe(0);
  });

  it("stops on the skip budget without claiming to have finished", async () => {
    const res = await readVacancyJsonLines(sliced(lines(500), 256), {
      ...OPEN,
      skipRecords: 400,
      maxSkipBytes: 1_000,
    });
    expect(res.stopReason).toBe("skip_budget");
    expect(res.completedStream).toBe(false);
    expect(res.records).toEqual([]);
  });
});

describe("readVacancyJsonLines — memory is bounded by construction", () => {
  it("reads far more bytes than it ever holds", async () => {
    // 20 000 records at ~60 B each, consumed 50 at a time. If the reader were
    // buffering the body, this is where it would show.
    const body = lines(20_000);
    const res = await readVacancyJsonLines(sliced(body, 8_192), {
      ...OPEN,
      maxRecords: 50,
    });
    expect(res.records).toHaveLength(50);
    expect(res.stopReason).toBe("record_budget");
    // It stopped early, so it never even pulled the whole body off the wire.
    expect(res.bytesRead).toBeLessThan(enc.encode(body).byteLength);
  });
});
