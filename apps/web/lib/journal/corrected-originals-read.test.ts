import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readCorrectedOriginalIds } from "./corrected-originals-read";

/** A keyset fake: `.gt("id", x)` + `.limit(n)` over rows ordered by id. */
function client(rows: { id: string; correction_of: string | null }[] | null, error: unknown = null) {
  const pages: (string | null)[] = [];
  const make = () => {
    let after: string | null = null;
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "not", "order"]) b[m] = () => b;
    b.gt = (_c: string, v: string) => {
      after = v;
      return b;
    };
    b.limit = (n: number) => {
      pages.push(after);
      if (!rows) return Promise.resolve({ data: null, error });
      const sorted = [...rows].sort((a, z) => (a.id < z.id ? -1 : 1));
      return Promise.resolve({ data: sorted.filter((r) => !after || r.id > after).slice(0, n), error });
    };
    return b;
  };
  return { ranges: pages, c: { from: () => make() } as never };
}

describe("the corrected originals a worker's live corrections replace", () => {
  it("returns the originals", async () => {
    const { c } = client([{ id: "c1", correction_of: "o1" }]);
    expect([...((await readCorrectedOriginalIds(c, "w1")) ?? [])]).toEqual(["o1"]);
  });

  it("a long history is read to the end, never discarded (1500 corrections → 2 pages)", async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: `c${String(i).padStart(5, "0")}`, correction_of: `o${i}` }));
    const { c, ranges } = client(rows);
    const set = await readCorrectedOriginalIds(c, "w1");
    expect(set?.size).toBe(1500);
    // Two keyset pages: from the start, then strictly after the 1000th id.
    expect(ranges).toEqual([null, "c00999"]);
  });

  it("is unknown (null) when the read fails", async () => {
    const { c } = client(null, { code: "x" });
    expect(await readCorrectedOriginalIds(c, "w1")).toBeNull();
  });
});
