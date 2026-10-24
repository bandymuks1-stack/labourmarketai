import { describe, expect, it } from "vitest";

import type { ForecastFactRows } from "./forecast-facts";
import { runRecomputePass, type ForecastCandidate, type ForecastRecord, type ForecastStore } from "./forecast-scheduler-core";

const ROWS: ForecastFactRows = {
  project: { status: "live", start_date: "2026-09-01", end_date: "2026-12-01" },
  tasks: { rows: [{ key: "a", parent_key: null, status: "todo", resolved_at: null }], truncated: false },
  stages: { rows: [], truncated: false },
  journal: { rows: [], truncated: false },
  allocations: { rows: [], truncated: false },
  team: { active_people: 1, absences: [] },
  defects: { rows: [], failed_corrections: 0 },
  readiness: { workers_with_missing: 0 },
  economics: { budget_total_cents: null, budget_lines_cents: null, budget_lines: 0, actual_cost_cents: 0 },
};

const candidate = (over: Partial<ForecastCandidate>): ForecastCandidate => ({
  projectId: "p1",
  mode: "daily",
  enabled: true,
  lastComputedAt: null,
  lastVersion: null,
  lastInputsHash: null,
  firstSignalAt: null,
  lastSignalAt: null,
  maxSignalId: null,
  lastForecast: null,
  ...over,
});

function fakeStore(candidates: ForecastCandidate[], rows: ForecastFactRows | null = ROWS) {
  const records: ForecastRecord[] = [];
  const factReads: string[] = [];
  const store: ForecastStore = {
    dueCandidates: async () => candidates,
    factRows: async (id) => {
      factReads.push(id);
      return rows;
    },
    record: async (r) => {
      records.push(r);
      return (candidates.find((c) => c.projectId === r.projectId)?.lastVersion ?? 0) + (r.storeVersion ? 1 : 0);
    },
  };
  return { store, records, factReads };
}

const NOW = "2026-10-21T10:00:00.000Z"; // a Wednesday

describe("the recompute pass", () => {
  it("computes a due project and records version 1 with its provenance", async () => {
    const { store, records } = fakeStore([candidate({ maxSignalId: 7 })]);
    const r = await runRecomputePass(store, { nowIso: NOW });
    expect(r).toMatchObject({ candidates: 1, computed: 1, newVersions: 1, failed: 0 });
    expect(records[0]).toMatchObject({
      projectId: "p1",
      mode: "daily",
      reason: "first",
      computedAt: NOW,
      asOf: "2026-10-21",
      engineVersion: "forecast-engine-v1",
      storeVersion: true,
      consumedSignalId: 7,
      comparison: null,
    });
    expect(records[0].forecast.kind).toBe("forecast");
    expect(records[0].inputsHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("the same facts again add NO version — only the last-computed mark moves", async () => {
    const first = fakeStore([candidate({})]);
    await runRecomputePass(first.store, { nowIso: NOW });
    const prev = first.records[0];
    const again = fakeStore([
      candidate({ lastComputedAt: "2026-10-20T06:00:00.000Z", lastVersion: 1, lastInputsHash: prev.inputsHash, lastForecast: prev.forecast }),
    ]);
    const r = await runRecomputePass(again.store, { nowIso: NOW });
    expect(r).toMatchObject({ computed: 1, newVersions: 0, unchanged: 1 });
    expect(again.records[0].storeVersion).toBe(false);
    expect(again.records[0].comparison).toMatchObject({ previousVersion: 1, sameInputs: true });
  });

  it("a weekly project on a Wednesday, and a live project still debouncing, are left alone", async () => {
    const { store, factReads } = fakeStore([
      candidate({ projectId: "weekly", mode: "weekly" }),
      candidate({
        projectId: "live",
        mode: "live",
        lastComputedAt: "2026-10-21T08:00:00.000Z",
        firstSignalAt: "2026-10-21T09:59:30.000Z",
        lastSignalAt: "2026-10-21T09:59:30.000Z",
      }),
    ]);
    const r = await runRecomputePass(store, { nowIso: NOW });
    expect(r).toMatchObject({ computed: 0, notDue: 2 });
    expect(factReads).toEqual([]);
  });

  it("a switched-off organization is never computed", async () => {
    const { store, factReads } = fakeStore([candidate({ enabled: false })]);
    expect(await runRecomputePass(store, { nowIso: NOW })).toMatchObject({ computed: 0, notDue: 1 });
    expect(factReads).toEqual([]);
  });

  it("bounded: stops at the time budget, and one failing project never stops the pass", async () => {
    let t = 0;
    const { store, records } = fakeStore([candidate({ projectId: "a" }), candidate({ projectId: "b" }), candidate({ projectId: "c" })]);
    const r = await runRecomputePass(store, { nowIso: NOW, timeBudgetMs: 15, clockMs: () => (t += 10) });
    expect(r?.stoppedEarly).toBe(true);
    expect(records.length).toBeLessThan(3);

    const broken = fakeStore([candidate({ projectId: "x" })], null);
    expect(await runRecomputePass(broken.store, { nowIso: NOW })).toMatchObject({ computed: 0, failed: 1 });
  });

  it("an unreadable candidate list is UNKNOWN (null), never 'nothing due'", async () => {
    const store: ForecastStore = { dueCandidates: async () => null, factRows: async () => null, record: async () => null };
    expect(await runRecomputePass(store, { nowIso: NOW })).toBeNull();
  });
});
