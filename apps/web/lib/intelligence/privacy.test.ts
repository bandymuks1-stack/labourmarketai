import { describe, it, expect } from "vitest";

import { PERSON_PRESENCE_MIN_N } from "@/lib/market-map/spatial-entities";
import { DEFAULT_MIN_BUCKET } from "@/lib/market-map/signal-model";
import {
  applyCohortPolicy,
  boundFilterDimensions,
  buildInsightQueryLogRecord,
  INTELLIGENCE_MIN_COHORT_N,
  INTELLIGENCE_SUPPRESS_BELOW_N,
  isExportablePrivacyClass,
} from "./privacy";

describe("cohort thresholds are aligned with the repo-wide §20 constants", () => {
  it("min cohort = PERSON_PRESENCE_MIN_N (5), suppress floor = DEFAULT_MIN_BUCKET (3)", () => {
    expect(INTELLIGENCE_MIN_COHORT_N).toBe(PERSON_PRESENCE_MIN_N);
    expect(INTELLIGENCE_MIN_COHORT_N).toBe(5);
    expect(INTELLIGENCE_SUPPRESS_BELOW_N).toBe(DEFAULT_MIN_BUCKET);
    expect(INTELLIGENCE_SUPPRESS_BELOW_N).toBe(3);
  });
});

describe("applyCohortPolicy", () => {
  it("n=5 → exact with the count", () => {
    expect(applyCohortPolicy(5)).toEqual({ kind: "exact", count: 5 });
  });

  it("n=4 and n=3 → small_sample (exact count structurally absent)", () => {
    expect(applyCohortPolicy(4)).toEqual({ kind: "small_sample" });
    expect(applyCohortPolicy(3)).toEqual({ kind: "small_sample" });
  });

  it("n=2, n=0 and garbage → suppressed", () => {
    expect(applyCohortPolicy(2)).toEqual({ kind: "suppressed" });
    expect(applyCohortPolicy(0)).toEqual({ kind: "suppressed" });
    expect(applyCohortPolicy(Number.NaN)).toEqual({ kind: "suppressed" });
  });
});

describe("boundFilterDimensions (anti-reconstruction)", () => {
  it("accepts up to 3 active dimensions", () => {
    expect(
      boundFilterDimensions({ country: "LT", skill: "welding", role: "welder" }),
    ).toEqual({ ok: true });
  });

  it("refuses a 4th active dimension", () => {
    expect(
      boundFilterDimensions({
        country: "LT",
        city: "Vilnius",
        skill: "welding",
        experienceYears: 12,
      }),
    ).toEqual({ ok: false, reasonCode: "too_many_filter_dimensions" });
  });

  it("null/undefined dimensions do not count against the bound", () => {
    expect(
      boundFilterDimensions({
        country: "LT",
        city: null,
        skill: undefined,
        role: "welder",
        window: "90d",
      }),
    ).toEqual({ ok: true });
  });
});

describe("isExportablePrivacyClass", () => {
  it("only public_aggregate is exportable", () => {
    expect(isExportablePrivacyClass("public_aggregate")).toBe(true);
    expect(isExportablePrivacyClass("tenant_aggregate")).toBe(false);
    expect(isExportablePrivacyClass("internal_only")).toBe(false);
    expect(isExportablePrivacyClass("anything_else")).toBe(false);
  });
});

describe("buildInsightQueryLogRecord", () => {
  const base = {
    insightKey: "worker_salary_vs_benchmark",
    observationIds: ["obs-1"],
    computationVersion: "1",
    viewerRole: "worker",
    profileId: "profile-1",
  };

  it("builds a record from scalar params", () => {
    const result = buildInsightQueryLogRecord({
      ...base,
      paramsSummary: { country: "LT", windowDays: 90, smallSample: false },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.paramsSummary).toEqual({
        country: "LT",
        windowDays: 90,
        smallSample: false,
      });
      expect(result.record.observationIds).toEqual(["obs-1"]);
    }
  });

  it("refuses object param values", () => {
    const result = buildInsightQueryLogRecord({
      ...base,
      paramsSummary: { filters: { name: "John" } },
    });
    expect(result).toEqual({
      ok: false,
      reasonCode: "non_scalar_params_summary_value",
    });
  });

  it("refuses array param values", () => {
    const result = buildInsightQueryLogRecord({
      ...base,
      paramsSummary: { emails: ["a@b.c"] },
    });
    expect(result.ok).toBe(false);
  });
});
