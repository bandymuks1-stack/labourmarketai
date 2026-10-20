import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readCorrectedOriginalIds } from "./corrected-originals-read";

/** A paged fake: `.range(from, to)` slices `rows`; every page records its range. */
function client(rows: { id: string; correction_of: string | null }[] | null, error: unknown = null) {
  const ranges: [number, number][] = [];
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "not", "order"]) b[m] = () => b;
  b.range = (from: number, to: number) => {
    ranges.push([from, to]);
    return Promise.resolve({ data: rows ? rows.slice(from, to + 1) : null, error });
  };
  return { ranges, c: { from: () => b } as never };
}

describe("the corrected originals a worker's live corrections replace", () => {
  it("returns the originals", async () => {
    const { c } = client([{ id: "c1", correction_of: "o1" }]);
    expect([...((await readCorrectedOriginalIds(c, "w1")) ?? [])]).toEqual(["o1"]);
  });

  it("a long history is read to the end, never discarded (1500 corrections → 2 pages)", async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: `c${i}`, correction_of: `o${i}` }));
    const { c, ranges } = client(rows);
    const set = await readCorrectedOriginalIds(c, "w1");
    expect(set?.size).toBe(1500);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("is unknown (null) when the read fails", async () => {
    const { c } = client(null, { code: "x" });
    expect(await readCorrectedOriginalIds(c, "w1")).toBeNull();
  });
});
