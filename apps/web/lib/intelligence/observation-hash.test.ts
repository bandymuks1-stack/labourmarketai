import { describe, it, expect } from "vitest";

import {
  computeObservationContentHash,
  type ObservationIdentityFields,
} from "./observation-hash";

const base: ObservationIdentityFields = {
  subjectKind: "profession",
  subjectId: "electrician",
  metricKey: "salary.declared_median",
  geo: { country: "LT", region: null, city: null },
  window: { start: "2026-04-01", end: "2026-06-30" },
  valueNumeric: 2100,
  unit: "eur_month_gross",
  statMethod: "median",
  sourceKind: "internal_aggregated",
  sourceKey: "internal_platform_aggregates",
  capturedAt: "2026-07-01T00:00:00.000Z",
  transformVersion: "1",
};

describe("computeObservationContentHash", () => {
  it("is deterministic (same input, same sha256 hex)", () => {
    const a = computeObservationContentHash(base);
    const b = computeObservationContentHash({ ...base });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is key-order insensitive", () => {
    // Same fields assembled in a different property order.
    const reordered = {
      transformVersion: base.transformVersion,
      capturedAt: base.capturedAt,
      sourceKey: base.sourceKey,
      sourceKind: base.sourceKind,
      statMethod: base.statMethod,
      unit: base.unit,
      valueNumeric: base.valueNumeric,
      window: { end: base.window.end, start: base.window.start },
      geo: { city: base.geo.city, region: base.geo.region, country: base.geo.country },
      metricKey: base.metricKey,
      subjectId: base.subjectId,
      subjectKind: base.subjectKind,
    } as ObservationIdentityFields;
    expect(computeObservationContentHash(reordered)).toBe(
      computeObservationContentHash(base),
    );
  });

  it("changes when the value changes", () => {
    expect(
      computeObservationContentHash({ ...base, valueNumeric: 2101 }),
    ).not.toBe(computeObservationContentHash(base));
  });

  it("changes when the window or geo changes", () => {
    expect(
      computeObservationContentHash({
        ...base,
        window: { start: "2026-01-01", end: "2026-03-31" },
      }),
    ).not.toBe(computeObservationContentHash(base));
    expect(
      computeObservationContentHash({
        ...base,
        geo: { country: "LV", region: null, city: null },
      }),
    ).not.toBe(computeObservationContentHash(base));
  });

  it("ignores extra non-identity properties on a wider object", () => {
    const wider = {
      ...base,
      confidence: 0.9,
      freshnessStatus: "fresh",
    } as ObservationIdentityFields;
    expect(computeObservationContentHash(wider)).toBe(
      computeObservationContentHash(base),
    );
  });
});
