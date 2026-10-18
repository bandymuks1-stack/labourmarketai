import { describe, expect, it, vi } from "vitest";

import type { DomainCaller } from "@/lib/domain/caller";

/**
 * THE JOURNAL LIST READ PAGES, AND SAYS WHEN IT STOPPED (issue #1689, lane
 * B — SEP-7: UNKNOWN ≠ ZERO).
 *
 * NEGATIVE CONTROL. On the pre-change tree `listJournalEntries` issued ONE
 * unbounded select; PostgREST answered with its `max_rows` (1000) and no
 * signal. Against the 2 500-row client below the old read returned 1 000
 * rows, `coverage` did not exist, and every figure built on the list
 * (section, CV, chat, MCP) under-counted silently. These tests fail on
 * that tree: the second and third `.range()` calls never happen, and the
 * result carries no `coverage`.
 */

vi.mock("@/lib/data/worker-core", () => ({
  readWorkerCoreRow: async () => ({ ok: true, value: { id: "w-1" } }),
}));

const { JOURNAL_LIST_PAGE_SIZE, listJournalEntries, readAllPages } = await import(
  "./journal-list-core"
);

type Row = {
  id: string;
  original_text: string;
  created_at: string;
  deleted_at: string | null;
  superseded_by: string | null;
  correction_of: string | null;
  engagement_context_id: string | null;
  journal_entry_metrics: never[];
  journal_entry_confirmations: never[];
};

function rows(n: number, patch: (i: number) => Partial<Row> = () => ({})): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `e-${String(i).padStart(5, "0")}`,
    original_text: `entry ${i}`,
    created_at: new Date(Date.UTC(2026, 0, 1) + (n - i) * 60_000).toISOString(),
    deleted_at: null,
    superseded_by: null,
    correction_of: null,
    engagement_context_id: null,
    journal_entry_metrics: [],
    journal_entry_confirmations: [],
    ...patch(i),
  }));
}

/**
 * A supabase client that serves `data` through `.range()` pages exactly as
 * PostgREST does (inclusive bounds), records every page asked for, and can
 * fail a chosen page or a chosen projection.
 */
function pagedClient(
  data: Row[],
  opts: { failFrom?: number; failSelectContaining?: string } = {},
) {
  const ranges: [number, number][] = [];
  const limits: number[] = [];
  const selects: string[] = [];
  const client = {
    from: () => {
      let select = "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {};
      b.select = (s: string) => {
        select = s;
        selects.push(s);
        return b;
      };
      for (const m of ["eq", "order", "is", "in"]) b[m] = () => b;
      b.range = async (from: number, to: number) => {
        ranges.push([from, to]);
        if (opts.failSelectContaining && select.includes(opts.failSelectContaining)) {
          return { data: null, error: { message: "undefined_column" } };
        }
        // fails EVERY read of the page starting at `failFrom` — whichever
        // projection asks for it
        if (opts.failFrom !== undefined && from === opts.failFrom) {
          return { data: null, error: { message: "boom" } };
        }
        return { data: data.slice(from, to + 1), error: null };
      };
      b.limit = async (n: number) => {
        limits.push(n);
        if (opts.failSelectContaining && select.includes(opts.failSelectContaining)) {
          return { data: null, error: { message: "undefined_column" } };
        }
        return { data: data.slice(0, n), error: null };
      };
      return b;
    },
  };
  const caller = { supabase: client, userId: "u-1" } as unknown as DomainCaller;
  return { caller, ranges, limits, selects };
}

describe("readAllPages — the one paging loop", () => {
  it("reads until a SHORT page (a full last page is followed by one more, empty, read)", async () => {
    const { caller, ranges } = pagedClient(rows(6));
    const build = () => caller.supabase.from("journal_entries").select("id").eq("worker_id", "w-1").order("id");
    const r = await readAllPages<Row>(build, { pageSize: 3, maxPages: 20 });
    expect(r.error).toBeNull();
    expect(r.rows.map((x) => x.id)).toEqual(rows(6).map((x) => x.id));
    // 6 rows / page 3 → pages [0,2] [3,5] full, then [6,8] empty → stop
    expect(ranges).toEqual([[0, 2], [3, 5], [6, 8]]);
    expect(r.truncated).toBe(false);
  });

  it("stops at the ceiling with `truncated: true` — more rows MAY exist and the caller is told", async () => {
    const { caller, ranges } = pagedClient(rows(10));
    const build = () => caller.supabase.from("journal_entries").select("id");
    const r = await readAllPages<Row>(build, { pageSize: 3, maxPages: 2 });
    expect(r.rows).toHaveLength(6);
    expect(ranges).toEqual([[0, 2], [3, 5]]);
    expect(r.truncated).toBe(true);
  });

  it("a page that fails fails the read — never a partial list posing as complete", async () => {
    const { caller } = pagedClient(rows(10), { failFrom: 3 });
    const build = () => caller.supabase.from("journal_entries").select("id");
    const r = await readAllPages<Row>(build, { pageSize: 3, maxPages: 5 });
    expect(r.error).not.toBeNull();
    expect(r.rows).toEqual([]);
  });

  it("the default page is PostgREST's own max_rows (supabase/config.toml)", () => {
    expect(JOURNAL_LIST_PAGE_SIZE).toBe(1000);
  });
});

describe("listJournalEntries — every live row, in 1000-row pages, with coverage", () => {
  it("2 500 rows arrive as three pages and coverage says so (pre-change: 1 000 rows, silently)", async () => {
    const { caller, ranges, limits } = pagedClient(rows(2500));
    const r = await listJournalEntries(caller, { workerId: "w-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(limits).toEqual([]);
    expect(r.entries).toHaveLength(2500);
    expect(r.coverage).toEqual({ entriesRead: 2500, truncated: false });
  });

  it("exactly 1 000 live rows: one full page, one empty page, not truncated", async () => {
    const { caller, ranges } = pagedClient(rows(1000));
    const r = await listJournalEntries(caller, { workerId: "w-1" });
    expect(r.ok && r.entries.length).toBe(1000);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(r.ok && r.coverage.truncated).toBe(false);
  });

  it("coverage counts the COUNTED entries: deleted, superseded and corrected originals are read but not in the base", async () => {
    const data = rows(1200, (i) =>
      i === 5
        ? { deleted_at: "2026-02-01T00:00:00Z" }
        : i === 6
          ? { superseded_by: "e-00007" }
          : i === 8
            ? { correction_of: "e-00009" }
            : {},
    );
    const { caller } = pagedClient(data);
    const r = await listJournalEntries(caller, { workerId: "w-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 1200 − deleted − superseded − the corrected original e-00009
    expect(r.entries).toHaveLength(1197);
    expect(r.correctedOriginals.map((e) => e.id)).toEqual(["e-00009"]);
    expect(r.coverage).toEqual({ entriesRead: 1197, truncated: false });
  });

  it("a caller-bounded read is ONE `.limit()` page and says whether the bound was hit", async () => {
    const full = pagedClient(rows(50));
    const r1 = await listJournalEntries(full.caller, { workerId: "w-1", limit: 20 });
    expect(full.ranges).toEqual([]);
    expect(full.limits).toEqual([20]);
    expect(r1.ok && r1.entries.length).toBe(20);
    expect(r1.ok && r1.coverage).toEqual({ entriesRead: 20, truncated: true });

    const short = pagedClient(rows(5));
    const r2 = await listJournalEntries(short.caller, { workerId: "w-1", limit: 20 });
    expect(r2.ok && r2.coverage).toEqual({ entriesRead: 5, truncated: false });
  });

  it("the pre-migration fallback pages too and carries coverage", async () => {
    const { caller, selects } = pagedClient(rows(1500), { failSelectContaining: "superseded_by" });
    const r = await listJournalEntries(caller, { workerId: "w-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(selects.some((s) => s.includes("superseded_by"))).toBe(true);
    expect(selects.some((s) => !s.includes("superseded_by"))).toBe(true);
    expect(r.entries).toHaveLength(1500);
    expect(r.coverage).toEqual({ entriesRead: 1500, truncated: false });
  });

  it("a failed later page is `unavailable` — never the first 1 000 rows as if complete", async () => {
    const { caller } = pagedClient(rows(2500), { failFrom: 1000 });
    const r = await listJournalEntries(caller, { workerId: "w-1" });
    // the v3 read failed on page 2; the legacy fallback then fails the same way
    expect(r).toEqual({ ok: false, code: "unavailable" });
  });
});
