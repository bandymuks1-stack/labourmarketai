import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const five = (prefix: string) => Array.from({ length: 5 }, (_, i) => ({ id: `${prefix}-${i}`, title: `tile ${prefix} ${i}` }));

const journalRows = five("j").map((r) => ({ id: r.id, original_text: r.title, correction_of: null }));
const conversationRows = five("c").map((r) => ({ id: r.id, subject: r.title }));
const fromCalls: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      fromCalls.push(table);
      const rows = table === "journal_entries" ? journalRows : conversationRows;
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "is", "order"]) chain[m] = () => chain;
      chain.limit = async () => ({ data: rows, error: null });
      return chain;
    },
  }),
}));

const projects = vi.fn(async () => five("p").map((r) => ({ id: r.id, title: r.title, city: null })));
vi.mock("@/lib/projects/projects", () => ({ listManagedProjects: () => projects() }));
const tasks = vi.fn(async () => ({ status: "ok", tasks: five("t") }));
vi.mock("@/lib/tasks/tasks", () => ({ listMyTasks: () => tasks() }));
const finance = vi.fn(async () => ({ status: "ok", records: five("f").map((r) => ({ ...r, counterpartyName: null })) }));
vi.mock("@/lib/finance/finance", () => ({ listMyFinanceRecords: () => finance() }));
const bookings = vi.fn(async () => ({ kind: "ok", incoming: five("b").map((r) => ({ id: r.id, roleText: r.title, note: null })), outgoing: [] }));
vi.mock("@/lib/booking/booking-actions", () => ({ listMyBookings: () => bookings() }));
const documents = vi.fn(async (): Promise<unknown> => ({
  kind: "ok",
  documents: [{ id: "d-1", documentTypeSlug: "tile-certificate", country: "LT" }],
}));
vi.mock("@/lib/documents/readiness", () => ({ listMyDocuments: () => documents() }));

import { getDashboardSearchGroups, getDashboardSearchReport } from "./dashboard-search";

beforeEach(() => {
  fromCalls.length = 0;
  for (const f of [projects, tasks, finance, bookings, documents]) f.mockClear();
});

describe("the dashboard search report", () => {
  it("with every source searched, six full groups fill the total cap and the seventh is dropped", async () => {
    const groups = await getDashboardSearchGroups("tile");
    expect(groups.map((g) => g.source)).toEqual(["journal", "projects", "tasks", "finance", "conversations", "bookings"]);
    expect(groups.reduce((n, g) => n + g.results.length, 0)).toBe(30);
  });

  it("a requested source is searched BEFORE the cap, so it cannot be crowded out", async () => {
    const report = await getDashboardSearchReport("tile", ["documents"]);
    expect(report.groups.map((g) => g.source)).toEqual(["documents"]);
    expect(report.groups[0].results).toHaveLength(1);
    expect(report.notRead).toEqual([]);
  });

  it("sources that were not asked for are not read at all", async () => {
    await getDashboardSearchReport("tile", ["documents"]);
    expect(fromCalls).toEqual([]);
    for (const f of [projects, tasks, finance, bookings]) expect(f).not.toHaveBeenCalled();
    expect(documents).toHaveBeenCalledTimes(1);
  });

  it("a source that could not be read is named, never an empty group", async () => {
    documents.mockResolvedValueOnce({ kind: "needs-migration" });
    const report = await getDashboardSearchReport("tile", ["documents"]);
    expect(report.groups).toEqual([]);
    expect(report.notRead).toEqual(["documents"]);
  });
});
