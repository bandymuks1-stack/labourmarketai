import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The organization's hour ledger reads past the server's 1000-row answer
 * (PostgREST max_rows). A fake that enforces exactly that proves the month
 * grid, the range report and the project's hours read EVERY record, and that
 * a read that cannot finish is UNKNOWN (error), never a partial total.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/lib/company/employer-company-context", () => ({
  resolveEmployerCompanyContext: async () => ({ kind: "ok", organizationId: "org-1" }),
}));

let total = 0;
let failAtFrom: number | null = null;
const inCalls: string[][] = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "lt", "lte", "is", "order"]) q[m] = () => q;
      q.in = (_c: string, ids: string[]) => {
        inCalls.push(ids);
        return q;
      };
      q.range = (from: number, to: number) => {
        if (failAtFrom !== null && from >= failAtFrom) return Promise.resolve({ data: null, error: { code: "57014" } });
        const end = Math.min(to, from + 999, total - 1);
        const data =
          from > end
            ? []
            : Array.from({ length: end - from + 1 }, (_, i) => ({
                id: `a${from + i}`,
                organization_id: "org-1",
                worker_id: "w",
                entered_by: "m",
                work_date: "2026-10-01",
                work_object_id: "o",
                hours_numeric: "1.00",
                note: null,
                source: "manual",
                status: "recorded",
                journal_entry_id: null,
                correction_of: null,
                superseded_by: null,
                created_at: "2026-10-01T00:00:00Z",
              }));
        return Promise.resolve({ data, error: null });
      };
      q.limit = () => Promise.resolve({ data: [], error: null });
      return q;
    },
  }),
}));

import { getAllocationsForMonth, getAllocationsForObjects, getAllocationsForRange } from "./allocations";

beforeEach(() => {
  total = 0;
  failAtFrom = null;
  inCalls.length = 0;
});

describe("the organization's hour ledger is read whole", () => {
  it("a month with 2,500 records reads all 2,500 (the re-import duplicate check sees every one)", async () => {
    total = 2500;
    const res = await getAllocationsForMonth("2026-10-01");
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") expect(res.rows).toHaveLength(2500);
  });

  it("a range report reads past 1000 too", async () => {
    total = 1001;
    const res = await getAllocationsForRange("2026-10-01", "2026-10-31");
    if (res.kind !== "ok") throw new Error(res.kind);
    expect(res.rows).toHaveLength(1001);
  });

  it("a project's hours cover every object, not only the first 100", async () => {
    total = 10;
    const objects = Array.from({ length: 250 }, (_, i) => `obj-${i}`);
    const res = await getAllocationsForObjects(objects);
    expect(res.kind).toBe("ok");
    expect(inCalls.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(new Set(inCalls.flat()).size).toBe(250);
  });

  it("a page that fails makes the read UNKNOWN, never a partial total", async () => {
    total = 2500;
    failAtFrom = 1000;
    expect((await getAllocationsForMonth("2026-10-01")).kind).toBe("error");
  });
});
