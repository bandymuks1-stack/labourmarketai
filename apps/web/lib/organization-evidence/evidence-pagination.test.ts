import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  EVIDENCE_PAGE_SIZE,
  listAllEvidenceRecords,
  readAllPages,
} from "./evidence-pagination";
import type { EvidenceRecordView } from "./import-core";

const caller = {} as never;
const rec = (i: number) => ({ id: `r${i}` }) as unknown as EvidenceRecordView;

/** A fake `listEvidenceRecords` over `total` rows that honours limit/offset. */
function source(total: number) {
  const calls: { limit?: number; offset?: number }[] = [];
  const list = (async (_c: unknown, f: { limit?: number; offset?: number }) => {
    calls.push({ limit: f.limit, offset: f.offset });
    const from = f.offset ?? 0;
    const n = Math.max(0, Math.min(f.limit ?? 200, total - from));
    return { kind: "ok", records: Array.from({ length: n }, (_, i) => rec(from + i)) };
  }) as never;
  return { list, calls };
}

describe("listAllEvidenceRecords — no silent 1000 cap", () => {
  it("reads past 1000: 2944 records come back as 2944, not truncated", async () => {
    const { list, calls } = source(2944);
    const res = await listAllEvidenceRecords(caller, { organizationId: "o1" }, { list });
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;
    expect(res.records).toHaveLength(2944);
    expect(res.truncated).toBe(false);
    expect(new Set(res.records.map((r) => r.id)).size).toBe(2944);
    expect(calls.map((c) => c.offset)).toEqual([0, 1000, 2000]);
  });

  it("an exact multiple of the page size ends with one empty page, not a cap", async () => {
    const { list } = source(2 * EVIDENCE_PAGE_SIZE);
    const res = await listAllEvidenceRecords(caller, {}, { list });
    expect(res.kind === "ok" && res.records.length).toBe(2000);
    expect(res.kind === "ok" && res.truncated).toBe(false);
  });

  it("DISCLOSES a safety ceiling instead of silently dropping the rest", async () => {
    const { list } = source(5000);
    const res = await listAllEvidenceRecords(caller, {}, { list, ceiling: 2000 });
    expect(res.kind).toBe("ok");
    if (res.kind !== "ok") return;
    expect(res.records).toHaveLength(2000);
    expect(res.truncated).toBe(true);
  });

  it("a corrected original on a page does not end the read early: pages are raw, superseded dropped after", async () => {
    // 3109 raw rows = 2944 records + 165 corrections; every 19th row is a superseded original.
    const superseded = (i: number) => i % 19 === 0;
    const supersededCount = Array.from({ length: 3109 }, (_, i) => i).filter(superseded).length;
    const list = (async (_c: unknown, f: { limit?: number; offset?: number; includeSuperseded?: boolean }) => {
      const from = f.offset ?? 0;
      const n = Math.max(0, Math.min(f.limit ?? 200, 3109 - from));
      const rows = Array.from({ length: n }, (_, i) => ({ ...rec(from + i), superseded: superseded(from + i) }) as unknown as EvidenceRecordView);
      return { kind: "ok", records: f.includeSuperseded ? rows : rows.filter((r) => !r.superseded) };
    }) as never;
    const res = await listAllEvidenceRecords(caller, { organizationId: "o1" }, { list });
    expect(res.kind === "ok" && res.records.length).toBe(3109 - supersededCount);
    expect(res.kind === "ok" && res.records.some((r) => r.superseded)).toBe(false);
    const raw = await listAllEvidenceRecords(caller, { organizationId: "o1", includeSuperseded: true }, { list });
    expect(raw.kind === "ok" && raw.records.length).toBe(3109);
  });

  it("is not truncated when the ceiling equals exactly what exists", async () => {
    const { list } = source(2000);
    const res = await listAllEvidenceRecords(caller, {}, { list, ceiling: 2000 });
    expect(res.kind === "ok" && res.truncated).toBe(false);
  });

  it("a failed page is the failure, never a shorter ok", async () => {
    let n = 0;
    const list = (async () => {
      n += 1;
      return n === 1
        ? { kind: "ok", records: Array.from({ length: EVIDENCE_PAGE_SIZE }, (_, i) => rec(i)) }
        : { kind: "error" };
    }) as never;
    expect((await listAllEvidenceRecords(caller, {}, { list })).kind).toBe("error");
  });

  it("reads one window of pages concurrently, and never past a short page", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const offsets: number[] = [];
    const list = (async (_c: unknown, f: { limit?: number; offset?: number }) => {
      offsets.push(f.offset ?? 0);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      const from = f.offset ?? 0;
      const n = Math.max(0, Math.min(f.limit ?? 200, 4500 - from));
      return { kind: "ok", records: Array.from({ length: n }, (_, i) => rec(from + i)) };
    }) as never;
    const res = await listAllEvidenceRecords(caller, {}, { list });
    expect(res.kind === "ok" && res.records.length).toBe(4500);
    expect(maxInFlight).toBe(3);
    // window 1: 0,1000,2000 (all full); window 2: 3000,4000,5000 — 4000 is short, so the read ends there.
    expect(offsets).toEqual([0, 1000, 2000, 3000, 4000, 5000]);
  });

  it("an empty read is ok with no records", async () => {
    const { list } = source(0);
    const res = await listAllEvidenceRecords(caller, {}, { list });
    expect(res).toEqual({ kind: "ok", records: [], truncated: false });
  });
});

describe("readAllPages", () => {
  it("pages a range read to the end", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const out = await readAllPages<{ id: number }>(async (from, to) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));
    expect(out?.rows).toHaveLength(2500);
    expect(out?.truncated).toBe(false);
  });
  it("a failed page is null (unavailable), not a partial list", async () => {
    const out = await readAllPages<{ id: number }>(async () => ({ data: null, error: { code: "X" } }));
    expect(out).toBeNull();
  });
});
