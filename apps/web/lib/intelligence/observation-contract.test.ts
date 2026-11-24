import { describe, it, expect } from "vitest";

import {
  computeFreshness,
  INTELLIGENCE_CONTRACT_VERSION,
  intelligenceObservationSchema,
} from "./observation-contract";

const validInternal = {
  subjectKind: "profession" as const,
  subjectId: "electrician",
  metricKey: "salary.declared_median",
  geo: { country: "LT", region: null, city: null },
  window: { start: "2026-04-01", end: "2026-06-30" },
  valueNumeric: 2100,
  unit: "eur_month_gross",
  statMethod: "median" as const,
  sourceKind: "internal_aggregated" as const,
  sourceKey: "internal_platform_aggregates",
  sourceUrl: null,
  derivationIds: ["agg-run-42"],
  capturedAt: "2026-07-01T00:00:00.000Z",
  validFrom: "2026-07-01T00:00:00.000Z",
  validTo: null,
  sampleSize: 17,
  confidence: null,
  transformVersion: "1",
  privacyClass: "public_aggregate" as const,
  freshnessStatus: "fresh" as const,
  provenance: [{ step: "aggregate", ref: "agg-run-42" }],
  contentHash: "abc123",
};

describe("intelligenceObservationSchema", () => {
  it("pins the contract version", () => {
    expect(INTELLIGENCE_CONTRACT_VERSION).toBe("1");
  });

  it("accepts a valid internal observation", () => {
    const parsed = intelligenceObservationSchema.safeParse(validInternal);
    expect(parsed.success).toBe(true);
  });

  it("accepts a valid external observation (sourceUrl set, derivationIds empty)", () => {
    const parsed = intelligenceObservationSchema.safeParse({
      ...validInternal,
      sourceKind: "public_official",
      sourceKey: "stat_gov_lt",
      sourceUrl: "https://osp.stat.gov.lt/some-dataset",
      derivationIds: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing sourceUrl for every external source kind", () => {
    for (const sourceKind of [
      "public_official",
      "licensed_partner",
      "approved_public_web",
    ] as const) {
      const parsed = intelligenceObservationSchema.safeParse({
        ...validInternal,
        sourceKind,
        sourceKey: "stat_gov_lt",
        sourceUrl: null,
        derivationIds: [],
      });
      expect(parsed.success, sourceKind).toBe(false);
    }
  });

  it("rejects empty derivationIds for internal_aggregated", () => {
    const parsed = intelligenceObservationSchema.safeParse({
      ...validInternal,
      derivationIds: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a window with end before start", () => {
    const parsed = intelligenceObservationSchema.safeParse({
      ...validInternal,
      window: { start: "2026-06-30", end: "2026-04-01" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a bad metricKey and a lowercase country", () => {
    expect(
      intelligenceObservationSchema.safeParse({
        ...validInternal,
        metricKey: "Salary Median!",
      }).success,
    ).toBe(false);
    expect(
      intelligenceObservationSchema.safeParse({
        ...validInternal,
        geo: { country: "lt", region: null, city: null },
      }).success,
    ).toBe(false);
  });

  it("rejects a non-finite value and unknown extra keys", () => {
    expect(
      intelligenceObservationSchema.safeParse({
        ...validInternal,
        valueNumeric: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false);
    expect(
      intelligenceObservationSchema.safeParse({
        ...validInternal,
        surprise: true,
      }).success,
    ).toBe(false);
  });
});

describe("computeFreshness", () => {
  const captured = "2026-07-01T00:00:00.000Z";
  const capturedMs = Date.parse(captured);
  const day = 24 * 60 * 60 * 1000;

  it("fresh within slaDays", () => {
    expect(computeFreshness(captured, capturedMs + 6 * day, 7)).toBe("fresh");
    expect(computeFreshness(captured, capturedMs + 7 * day, 7)).toBe("fresh");
  });

  it("stale within 3x slaDays", () => {
    expect(computeFreshness(captured, capturedMs + 8 * day, 7)).toBe("stale");
    expect(computeFreshness(captured, capturedMs + 21 * day, 7)).toBe("stale");
  });

  it("expired after 3x slaDays", () => {
    expect(computeFreshness(captured, capturedMs + 22 * day, 7)).toBe(
      "expired",
    );
  });

  it("unparsable capture time is expired, never optimistically fresh", () => {
    expect(computeFreshness("not-a-date", capturedMs, 7)).toBe("expired");
  });
});
