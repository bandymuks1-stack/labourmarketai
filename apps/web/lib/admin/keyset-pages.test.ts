import { describe, expect, it } from "vitest";

import { readKeysetPagesDesc } from "./keyset-pages";

type Row = { id: string; created_at: string };

/** A fake table ordered newest first; `.or()` applies the keyset cursor. */
function table(rows: Row[]) {
  const sorted = [...rows].sort((a, b) => (a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1));
  const ors: string[] = [];
  const build = () => {
    let cursor: { c: string; i: string } | null = null;
    const q: Record<string, unknown> = {};
    q.or = (f: string) => {
      ors.push(f);
      const m = /created_at\.lt\."([^"]+)",and\(created_at\.eq\."([^"]+)",id\.lt\."([^"]+)"\)/.exec(f)!;
      cursor = { c: m[1]!, i: m[3]! };
      return q;
    };
    q.order = () => q;
    q.limit = (n: number) => {
      const after = cursor
        ? sorted.filter((r) => r.created_at < cursor!.c || (r.created_at === cursor!.c && r.id < cursor!.i))
        : sorted;
      return Promise.resolve({ data: after.slice(0, n), error: null });
    };
    return q;
  };
  return { build, ors };
}

const rows = (n: number, sameTimestamp = false): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `id-${String(i).padStart(5, "0")}`,
    created_at: sameTimestamp ? "2026-10-20T08:00:00Z" : `2026-10-20T08:${String(Math.floor(i / 60) % 60).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z`,
  }));

describe("keyset paging over a live table", () => {
  it("reads every row once across pages, cursor after the last row read", async () => {
    const { build, ors } = table(rows(2500));
    const r = await readKeysetPagesDesc<Row>(build, { maxRows: 5000 });
    expect(r.rows).toHaveLength(2500);
    expect(new Set(r.rows.map((x) => x.id)).size).toBe(2500);
    expect(r.truncated).toBe(false);
    expect(ors).toHaveLength(2);
  });

  it("rows sharing one timestamp are still each read once (id breaks the tie)", async () => {
    const { build } = table(rows(2100, true));
    const r = await readKeysetPagesDesc<Row>(build, { maxRows: 5000 });
    expect(new Set(r.rows.map((x) => x.id)).size).toBe(2100);
  });

  it("stops at the cap and says so", async () => {
    const { build } = table(rows(3000));
    const r = await readKeysetPagesDesc<Row>(build, { maxRows: 2000 });
    expect(r.rows).toHaveLength(2000);
    expect(r.truncated).toBe(true);
  });

  it("a failed page is an error, never a partial answer", async () => {
    const build = () => {
      const q: Record<string, unknown> = {};
      q.or = () => q;
      q.order = () => q;
      q.limit = () => Promise.resolve({ data: null, error: { code: "x" } });
      return q;
    };
    const r = await readKeysetPagesDesc<Row>(build, { maxRows: 5000 });
    expect(r.error).toBeTruthy();
    expect(r.rows).toEqual([]);
  });
});
