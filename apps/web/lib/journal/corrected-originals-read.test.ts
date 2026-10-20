import { describe, expect, it } from "vitest";

import { readCorrectedOriginalIds } from "./corrected-originals-read";

function client(rows: { id: string; correction_of: string | null }[] | null, error: unknown = null) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "not", "limit"]) b[m] = () => b;
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error });
  return { from: () => b } as never;
}

describe("the corrected originals a worker's live corrections replace", () => {
  it("returns the originals", async () => {
    const s = await readCorrectedOriginalIds(client([{ id: "c1", correction_of: "o1" }]), "w1");
    expect([...(s ?? [])]).toEqual(["o1"]);
  });
  it("is unknown (null) at the read cap, never a partial set", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: `c${i}`, correction_of: `o${i}` }));
    expect(await readCorrectedOriginalIds(client(rows), "w1")).toBeNull();
  });
  it("is unknown (null) when the read fails", async () => {
    expect(await readCorrectedOriginalIds(client(null, { code: "x" }), "w1")).toBeNull();
  });
});
