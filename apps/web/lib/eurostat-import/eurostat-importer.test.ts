import { afterEach, describe, expect, it, vi } from "vitest";

import { runEurostatImport } from "./eurostat-importer";

/** une_rt_m-shaped body for ONE requested geo × two months = 2 cells,
 *  mirroring the real API's server-side geo filtering. */
function uneBodyForGeo(geo: string): string {
  return JSON.stringify({
    class: "dataset",
    label: "Unemployment by sex and age - monthly data",
    updated: "2026-07-02T23:00:00+0200",
    id: ["freq", "s_adj", "age", "unit", "sex", "geo", "time"],
    size: [1, 1, 1, 1, 1, 1, 2],
    dimension: {
      freq: { category: { index: { M: 0 }, label: { M: "Monthly" } } },
      s_adj: { category: { index: { SA: 0 }, label: { SA: "SA" } } },
      age: { category: { index: { TOTAL: 0 }, label: { TOTAL: "Total" } } },
      unit: { category: { index: { PC_ACT: 0 }, label: { PC_ACT: "PC_ACT" } } },
      sex: { category: { index: { T: 0 }, label: { T: "Total" } } },
      geo: { category: { index: { [geo]: 0 }, label: { [geo]: geo } } },
      time: { category: { index: { "2026-04": 0, "2026-05": 1 }, label: { "2026-04": "2026-04", "2026-05": "2026-05" } } },
    },
    value: { 0: 6.1, 1: 6.0 },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function enable() {
  vi.stubEnv("EUROSTAT_SOURCE_ENABLED", "on");
  vi.stubEnv("EUROSTAT_KILL_SWITCH", "");
}

describe("runEurostatImport — eurostat is activated; dry-run accepts but never persists", () => {
  it("fetches, parses and validates candidates as ACCEPTED (source active), persisting nothing in dry-run", async () => {
    enable();
    // Fresh Response per call, filtered to the requested geo (as the real
    // API does). A Response body can only be read once.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        const geo = new URL(url).searchParams.get("geo") ?? "EU27_2020";
        return Promise.resolve(
          new Response(uneBodyForGeo(geo), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    );
    const res = await runEurostatImport({
      mode: "dry_run",
      datasetCodes: ["une_rt_m"],
      geos: ["EU27_2020", "LT"],
      lastTimePeriod: 2,
      nowMs: Date.parse("2026-07-10T00:00:00Z"),
      sessionId: "test-session",
      startedAtIso: "2026-07-10T00:00:00.000Z",
      finishedAtIso: "2026-07-10T00:00:01.000Z",
    });

    expect(res.operational).toBe(true);
    // 2 geos × 2 months = 4 candidate cells; eurostat is active → all accepted
    expect(res.acceptedObservations.length).toBe(4);
    expect(res.validAfterActivation).toBe(0);
    // session accounting balances exactly
    expect(res.session).not.toBeNull();
    if (res.session) {
      expect(
        res.session.itemsAccepted + res.session.itemsRejected + res.session.itemsDuplicated,
      ).toBe(res.session.itemsScanned);
      expect(res.session.itemsAccepted).toBe(4);
    }
    // no genuine data-defect reason
    const reasons = new Set(res.session?.reasonCounts.map((r) => r.code));
    for (const code of reasons) {
      expect(code.startsWith("data_"), code).toBe(false);
    }
    // dry-run NEVER persists, even with the source active
    expect(res.persistedInserted).toBe(0);
  });

  it("dedupes a repeated geo (one fetch, one geo's cells — no double work)", async () => {
    enable();
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      const geo = new URL(url).searchParams.get("geo") ?? "LT";
      return Promise.resolve(
        new Response(uneBodyForGeo(geo), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchSpy);
    const res = await runEurostatImport({
      mode: "dry_run",
      datasetCodes: ["une_rt_m"],
      geos: ["LT", "LT", "LT"], // duplicated
      lastTimePeriod: 2,
      nowMs: Date.parse("2026-07-10T00:00:00Z"),
      sessionId: "dedup",
      startedAtIso: "2026-07-10T00:00:00.000Z",
      finishedAtIso: "2026-07-10T00:00:01.000Z",
    });
    // one distinct geo → one fetch, 2 period cells scanned (not 6)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.session?.itemsScanned).toBe(2);
  });

  it("makes NO network call and persists nothing when the kill switch is engaged", async () => {
    vi.stubEnv("EUROSTAT_SOURCE_ENABLED", "on");
    vi.stubEnv("EUROSTAT_KILL_SWITCH", "on");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const persist = vi.fn();
    const res = await runEurostatImport({
      mode: "persist",
      datasetCodes: ["une_rt_m"],
      geos: ["LT"],
      lastTimePeriod: 2,
      nowMs: Date.now(),
      sessionId: "killed",
      startedAtIso: "2026-07-10T00:00:00.000Z",
      finishedAtIso: "2026-07-10T00:00:00.500Z",
      persist,
    });
    expect(res.operational).toBe(false);
    expect(res.blockedReason).toBe("kill_switch_engaged");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(res.report?.warningCodes).toContain("eurostat_kill_switch_engaged");
  });
});
