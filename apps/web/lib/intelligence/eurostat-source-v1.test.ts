import { describe, it, expect } from "vitest";

import {
  EUROSTAT_DATASETS,
  EUROSTAT_METRIC_KEYS,
  EUROSTAT_METRIC_EXPECTED_UNIT,
  EUROSTAT_GEO_ALLOWLIST,
  EUROSTAT_GEO_COUNTRIES,
  EUROSTAT_IMPORT_BOUNDS,
  EUROSTAT_REJECT_FLAGS,
  getEurostatDataset,
  isAllowedEurostatGeo,
  toObservationGeoCountry,
  eurostatPeriodToWindow,
} from "./eurostat-source-v1";
import {
  INTELLIGENCE_METRIC_KEY_PATTERN,
  isKnownMetricKey,
  METRIC_EXPECTED_UNIT,
} from "./metric-keys";

describe("Eurostat dataset contract", () => {
  it("ships at most four datasets, each with a 1:1 metric+unit mapping", () => {
    expect(EUROSTAT_DATASETS.length).toBeGreaterThan(0);
    expect(EUROSTAT_DATASETS.length).toBeLessThanOrEqual(4);
    const metrics = new Set<string>();
    for (const d of EUROSTAT_DATASETS) {
      expect(EUROSTAT_METRIC_KEYS).toContain(d.metricKey);
      expect(d.unit).toBe(EUROSTAT_METRIC_EXPECTED_UNIT[d.metricKey]);
      // deterministic metric per dataset (no two datasets share a metric)
      expect(metrics.has(d.metricKey), d.code).toBe(false);
      metrics.add(d.metricKey);
      // pinned dimensions are single codes; api path is scheme-less
      expect(d.apiPathTemplate).not.toMatch(/https?:\/\//);
      expect(Object.keys(d.pinnedDimensions).length).toBeGreaterThan(0);
    }
  });

  it("every Eurostat metric key is canonical, pattern-safe and unit-bound", () => {
    for (const key of EUROSTAT_METRIC_KEYS) {
      expect(key).toMatch(INTELLIGENCE_METRIC_KEY_PATTERN);
      expect(isKnownMetricKey(key)).toBe(true);
      expect(METRIC_EXPECTED_UNIT[key]).toBe(EUROSTAT_METRIC_EXPECTED_UNIT[key]);
    }
  });

  it("getEurostatDataset returns null for a non-allowlisted code", () => {
    expect(getEurostatDataset("lfsi_emp_q")).not.toBeNull();
    expect(getEurostatDataset("nama_10_gdp")).toBeNull();
    expect(getEurostatDataset("")).toBeNull();
  });

  it("import bounds forbid an unbounded backfill", () => {
    expect(EUROSTAT_IMPORT_BOUNDS.maxPeriodsPerSeries).toBeLessThanOrEqual(24);
    expect(EUROSTAT_IMPORT_BOUNDS.maxAcceptedPerSession).toBeLessThanOrEqual(5000);
    expect(EUROSTAT_IMPORT_BOUNDS.maxSessionsPerDay).toBe(1);
  });
});

describe("Eurostat geography allowlist (EU/EFTA only, reuse-safe)", () => {
  it("accepts EU aggregates and members, rejects non-EU/EFTA and junk", () => {
    expect(isAllowedEurostatGeo("EU27_2020")).toBe(true);
    expect(isAllowedEurostatGeo("EA20")).toBe(true);
    expect(isAllowedEurostatGeo("LT")).toBe(true);
    expect(isAllowedEurostatGeo("NO")).toBe(true); // EFTA
    expect(isAllowedEurostatGeo("US")).toBe(false);
    expect(isAllowedEurostatGeo("JP")).toBe(false);
    expect(isAllowedEurostatGeo("XX")).toBe(false);
  });

  it("uses the Eurostat 'EL' code for Greece, never ISO 'GR'", () => {
    expect(EUROSTAT_GEO_COUNTRIES).toContain("EL");
    expect(EUROSTAT_GEO_COUNTRIES).not.toContain("GR");
  });

  it("maps 2-letter geos to a country, aggregates to null country", () => {
    expect(toObservationGeoCountry("LT")).toBe("LT");
    expect(toObservationGeoCountry("EU27_2020")).toBeNull();
    expect(toObservationGeoCountry("EA20")).toBeNull();
  });

  it("the country policy list is a subset of the geo allowlist", () => {
    for (const c of EUROSTAT_GEO_COUNTRIES) {
      expect(EUROSTAT_GEO_ALLOWLIST).toContain(c);
    }
  });
});

describe("period → window mapping (fail-closed)", () => {
  it("maps monthly periods to first/last day of month", () => {
    expect(eurostatPeriodToWindow("2026-02")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
    expect(eurostatPeriodToWindow("2024-02")).toEqual({
      start: "2024-02-01",
      end: "2024-02-29", // leap year
    });
  });

  it("maps quarterly periods to the correct 3-month window", () => {
    expect(eurostatPeriodToWindow("2025-Q1")).toEqual({
      start: "2025-01-01",
      end: "2025-03-31",
    });
    expect(eurostatPeriodToWindow("2025-Q4")).toEqual({
      start: "2025-10-01",
      end: "2025-12-31",
    });
  });

  it("returns null for unknown / malformed period shapes (never guessed)", () => {
    for (const bad of ["2026", "2026-13", "2026-Q5", "2026-00", "garbage", ""]) {
      expect(eurostatPeriodToWindow(bad), bad).toBeNull();
    }
  });
});

describe("Eurostat status flags", () => {
  it("confidential/missing markers are reject flags", () => {
    expect(EUROSTAT_REJECT_FLAGS.has("c")).toBe(true);
    expect(EUROSTAT_REJECT_FLAGS.has(":")).toBe(true);
    expect(EUROSTAT_REJECT_FLAGS.has("p")).toBe(false); // provisional is disclosed, not rejected
  });
});
