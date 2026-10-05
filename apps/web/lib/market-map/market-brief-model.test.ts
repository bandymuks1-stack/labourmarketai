import { describe, expect, it } from "vitest";

import { deriveMarketBrief, derivePlaceSignal, visibleMarketSignals } from "./market-brief-model";
import type { VacancyVolumeResult } from "./vacancy-volume";
import type { WorldCounts, WorldViewResult } from "./world-model";

const counts = (over: Partial<WorldCounts> = {}): WorldCounts => ({
  inViewObjects: 0,
  inViewWeight: 0,
  renderedClusters: 0,
  renderedObjects: 0,
  overflowClusters: 0,
  overflowObjects: 0,
  overflowWeight: 0,
  outOfViewObjects: 0,
  unplaced: 0,
  withheld: 0,
  truncated: false,
  newestAt: null,
  ...over,
});

function world(state: { kind: string; reason?: string }, c: Partial<WorldCounts> = {}): WorldViewResult {
  return {
    kind: "ok",
    view: {
      layer: "demand",
      scale: "country",
      state: state as never,
      clusters: [],
      view: { origin: "live", center: [50, 10], zoom: 4, regions: [] } as never,
      counts: counts(c),
      notes: [],
      countries: ["LT"],
    },
  };
}

const NO_VACANCIES: VacancyVolumeResult = { kind: "unavailable" };

describe("derivePlaceSignal", () => {
  it("a reader that threw, or a non-ok result, is UNKNOWN — never empty", () => {
    expect(derivePlaceSignal(null)).toEqual({ state: "unknown" });
    expect(derivePlaceSignal({ kind: "not_authenticated" })).toEqual({ state: "unknown" });
    expect(derivePlaceSignal({ kind: "invalid" })).toEqual({ state: "unknown" });
    expect(derivePlaceSignal(world({ kind: "error", reason: "own_demand_read_failed" }))).toEqual({
      state: "unknown",
    });
  });

  it("a real empty answer is EMPTY", () => {
    expect(derivePlaceSignal(world({ kind: "empty" }))).toEqual({ state: "empty" });
    expect(derivePlaceSignal(world({ kind: "unavailable", reason: "no_known_places_in_view" }))).toEqual({
      state: "empty",
    });
  });

  it("counts the objects and the places, carries freshness and the lower bound", () => {
    const s = derivePlaceSignal(
      world(
        { kind: "ok" },
        {
          inViewObjects: 12,
          renderedClusters: 4,
          overflowClusters: 1,
          truncated: true,
          newestAt: "2026-10-04T08:00:00Z",
        },
      ),
    );
    expect(s).toEqual({
      state: "known",
      count: 12,
      places: 5,
      lowerBound: true,
      unplaced: 0,
      newestAt: "2026-10-04T08:00:00Z",
    });
  });

  it("rows with no resolvable country still count — they are real, just not drawn", () => {
    const s = derivePlaceSignal(world({ kind: "empty" }, { unplaced: 3 }));
    expect(s).toMatchObject({ state: "known", count: 3, places: 0, unplaced: 3 });
  });
});

describe("deriveMarketBrief", () => {
  it("vacancies: ok carries exact counts + the measured moment; empty names the profession; the rest is absent", () => {
    const ok: VacancyVolumeResult = {
      kind: "ok",
      data: {
        view: { origin: "live", center: [50, 10], zoom: 4, regions: [] } as never,
        professionSlug: "electrician",
        derived: false,
        activeAds: 120,
        newAds7d: 9,
        newAds30d: 41,
        measuredAtIso: "2026-10-05T10:00:00Z",
        rankingWindowAds: 120,
        rankingWindowCoversAll: true,
        countries: ["LT", "LV"],
      },
    };
    expect(deriveMarketBrief({ needs: null, projects: null, vacancies: ok, territoryCount: null }).vacancies).toEqual({
      state: "known",
      ads: 120,
      newAds7d: 9,
      newAds30d: 41,
      professionSlug: "electrician",
      derived: false,
      countries: ["LT", "LV"],
      measuredAtIso: "2026-10-05T10:00:00Z",
    });
    expect(
      deriveMarketBrief({
        needs: null,
        projects: null,
        vacancies: { kind: "empty", professionSlug: "electrician", derived: true },
        territoryCount: null,
      }).vacancies,
    ).toEqual({ state: "empty", professionSlug: "electrician", derived: true });
    expect(deriveMarketBrief({ needs: null, projects: null, vacancies: NO_VACANCIES, territoryCount: null }).vacancies).toEqual({
      state: "absent",
    });
  });

  it("territory is absent unless the caller has one", () => {
    const base = { needs: null, projects: null, vacancies: NO_VACANCIES };
    expect(deriveMarketBrief({ ...base, territoryCount: null }).territory).toEqual({ state: "absent" });
    expect(deriveMarketBrief({ ...base, territoryCount: 0 }).territory).toEqual({ state: "absent" });
    expect(deriveMarketBrief({ ...base, territoryCount: 2 }).territory).toEqual({ state: "known", places: 2 });
  });

  it("the brief has NO field for ratio, rate, match, team or people counts", () => {
    const brief = deriveMarketBrief({ needs: null, projects: null, vacancies: NO_VACANCIES, territoryCount: null });
    expect(Object.keys(brief).sort()).toEqual(["needs", "projects", "territory", "vacancies"]);
  });
});

describe("visibleMarketSignals", () => {
  it("always states needs; drops absent vacancies/territory and EMPTY projects; keeps a failed projects read", () => {
    const empty = deriveMarketBrief({
      needs: world({ kind: "empty" }),
      projects: world({ kind: "empty" }),
      vacancies: NO_VACANCIES,
      territoryCount: null,
    });
    expect(visibleMarketSignals(empty)).toEqual(["needs"]);

    const failed = deriveMarketBrief({
      needs: world({ kind: "empty" }),
      projects: null,
      vacancies: NO_VACANCIES,
      territoryCount: 1,
    });
    expect(visibleMarketSignals(failed)).toEqual(["needs", "projects", "territory"]);
  });
});
