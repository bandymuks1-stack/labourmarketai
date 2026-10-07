import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F12 (counter-canonical v1): the reports hub project tile must count every
 * project the company owns. It read `.limit(100)` rows and kept only the four
 * whitelisted statuses, so project 101+ and any project in another status
 * vanished from the tile while the projects page still showed them.
 */
const counts: { total: number | null; byStatus: Record<string, number>; error: boolean } = {
  total: 0,
  byStatus: {},
  error: false,
};

function builder() {
  let status: string | null = null;
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = (col: string, val: string) => {
    if (col === "status") status = val;
    return b;
  };
  b.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
    Promise.resolve(
      counts.error
        ? { count: null, error: { code: "57014" } }
        : { count: status === null ? counts.total : (counts.byStatus[status] ?? 0), error: null },
    ).then(ok, err);
  return b;
}

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from: () => builder() })) }));
vi.mock("@/lib/projects/projects", () => ({ callerCompanyId: vi.fn(async () => "company-1") }));

import { readProjectCounts } from "@/lib/reports/reports-hub";

beforeEach(() => {
  counts.total = 0;
  counts.byStatus = {};
  counts.error = false;
});

describe("reports hub project tile", () => {
  it("counts past 100 rows and reports unlisted statuses as 'other' instead of dropping them", async () => {
    counts.total = 130;
    counts.byStatus = { draft: 10, live: 100, paused: 5, completed: 10 };
    const r = await readProjectCounts();
    expect(r).toEqual({
      state: "ok",
      byStatus: { draft: 10, live: 100, paused: 5, completed: 10 },
      other: 5, // e.g. a legacy 'closed' - pre-fix: dropped
      total: 130, // pre-fix: min(rows, 100) minus the dropped statuses
    });
  });

  it("a failed count is unavailable, never a zero tile", async () => {
    counts.error = true;
    expect(await readProjectCounts()).toEqual({ state: "unavailable" });
  });
});
