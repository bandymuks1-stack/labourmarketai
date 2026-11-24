import { describe, it, expect } from "vitest";

import {
  buildInternalSalaryAggregate,
  buildSalaryIntelligenceView,
  compareSalaryToBenchmark,
  CURATED_NO_SAMPLE_UNCERTAINTY_CODE,
  toSalaryBenchmark,
  type SalaryBenchmarkV1,
  type SalaryIntelligenceView,
} from "./salary-model";

const FIXED_NOW_MS = Date.parse("2026-07-01T12:00:00.000Z");

function validInput() {
  return {
    valueEur: 2000,
    basis: "gross",
    statMethod: "median",
    geo: { country: "LT", region: null, city: null },
    sampleSize: 12,
    sourceKey: "internal_platform_aggregates",
    sourceKind: "internal_aggregated",
    observedAtIso: "2026-07-01T00:00:00.000Z",
    originKind: "internal",
  };
}

function benchmark(over: Partial<SalaryBenchmarkV1> = {}): SalaryBenchmarkV1 {
  const built = toSalaryBenchmark(validInput());
  if (!built.ok) throw new Error("fixture benchmark must build");
  return { ...built.benchmark, ...over };
}

describe("toSalaryBenchmark", () => {
  it("builds from complete input", () => {
    const built = toSalaryBenchmark(validInput());
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.benchmark.period).toBe("month");
      expect(built.benchmark.uncertaintyCodes).toEqual([]);
    }
  });

  it("refuses and LISTS missing source, date, geo, basis, sample", () => {
    const built = toSalaryBenchmark({ valueEur: 2000 });
    expect(built.ok).toBe(false);
    if (!built.ok) {
      for (const field of [
        "basis",
        "statMethod",
        "geo",
        "sourceKey",
        "sourceKind",
        "observedAtIso",
        "originKind",
        "sampleSize",
      ]) {
        expect(built.missing, field).toContain(field);
      }
    }
  });

  it("refuses a missing/non-positive value", () => {
    for (const valueEur of [undefined, null, 0, -5, Number.NaN]) {
      const built = toSalaryBenchmark({ ...validInput(), valueEur });
      expect(built.ok).toBe(false);
      if (!built.ok) expect(built.missing).toContain("valueEur");
    }
  });

  it("null sampleSize is allowed ONLY for admin_market_rate_averages, with the curated uncertainty code", () => {
    const refused = toSalaryBenchmark({ ...validInput(), sampleSize: null });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.missing).toContain("sampleSize");

    const curated = toSalaryBenchmark({
      ...validInput(),
      sampleSize: null,
      sourceKey: "admin_market_rate_averages",
    });
    expect(curated.ok).toBe(true);
    if (curated.ok) {
      expect(curated.benchmark.sampleSize).toBeNull();
      expect(curated.benchmark.uncertaintyCodes).toContain(
        CURATED_NO_SAMPLE_UNCERTAINTY_CODE,
      );
    }
  });

  it("refuses a geography without a valid ISO-2 country", () => {
    const built = toSalaryBenchmark({
      ...validInput(),
      geo: { country: null, region: null, city: null },
    });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.missing).toContain("geo");
  });
});

describe("compareSalaryToBenchmark", () => {
  it("gross vs net → not_comparable basis_mismatch (never converted)", () => {
    const result = compareSalaryToBenchmark(2000, "net", benchmark());
    expect(result).toEqual({
      kind: "not_comparable",
      reasonCode: "basis_mismatch",
    });
  });

  it("unknown basis on either side → not_comparable basis_unknown", () => {
    expect(compareSalaryToBenchmark(2000, "unknown", benchmark()).kind).toBe(
      "not_comparable",
    );
    const r = compareSalaryToBenchmark(
      2000,
      "gross",
      benchmark({ basis: "unknown" }),
    );
    expect(r).toEqual({ kind: "not_comparable", reasonCode: "basis_unknown" });
  });

  it("non-finite subject → insufficient_data", () => {
    const r = compareSalaryToBenchmark(Number.NaN, "gross", benchmark());
    expect(r.kind).toBe("insufficient_data");
  });

  it("±10% band edges: -10 and +10 are within; beyond is below/above", () => {
    const b = benchmark({ valueEur: 2000 });
    const at = (eur: number) => compareSalaryToBenchmark(eur, "gross", b);

    const minus10 = at(1800);
    expect(minus10.kind).toBe("compared");
    if (minus10.kind === "compared") {
      expect(minus10.positionPct).toBe(-10);
      expect(minus10.band).toBe("within");
    }

    const plus10 = at(2200);
    if (plus10.kind === "compared") {
      expect(plus10.positionPct).toBe(10);
      expect(plus10.band).toBe("within");
    }

    const below = at(1798);
    if (below.kind === "compared") expect(below.band).toBe("below");
    const above = at(2202);
    if (above.kind === "compared") expect(above.band).toBe("above");
  });

  it("a compared result always carries a full explanation", () => {
    const r = compareSalaryToBenchmark(2400, "gross", benchmark());
    expect(r.kind).toBe("compared");
    if (r.kind === "compared") {
      expect(r.explanation.meaningCode.length).toBeGreaterThan(0);
      expect(r.explanation.dataBasisCodes.length).toBeGreaterThan(0);
      expect(r.explanation.originKind).toBe("internal");
      expect(r.explanation.sampleSize).toBe(12);
    }
  });
});

describe("buildInternalSalaryAggregate", () => {
  const opts = {
    basis: "gross" as const,
    geo: { country: "LT", region: null, city: null },
    nowMs: FIXED_NOW_MS,
  };

  it("suppressed below cohort: n=2 and n=4 both refuse", () => {
    expect(buildInternalSalaryAggregate([1000, 2000], opts)).toEqual({
      kind: "insufficient_data",
      reasonCode: "cohort_below_minimum",
    });
    expect(
      buildInternalSalaryAggregate([1000, 2000, 3000, 4000], opts).kind,
    ).toBe("insufficient_data");
  });

  it("n=5 builds median + mean benchmarks with sampleSize", () => {
    const r = buildInternalSalaryAggregate(
      [1000, 1500, 2000, 2500, 4000],
      opts,
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.sampleSize).toBe(5);
      expect(r.median.valueEur).toBe(2000);
      expect(r.mean.valueEur).toBe(2200);
      expect(r.median.statMethod).toBe("median");
      expect(r.mean.statMethod).toBe("mean");
      expect(r.median.sourceKey).toBe("internal_platform_aggregates");
      expect(r.median.originKind).toBe("internal");
    }
  });

  it("is deterministic with a fixed nowMs (no Date.now inside)", () => {
    const values = [1000, 1500, 2000, 2500, 4000];
    const a = buildInternalSalaryAggregate(values, opts);
    const b = buildInternalSalaryAggregate(values, opts);
    expect(a).toEqual(b);
    if (a.kind === "ok") {
      expect(a.median.observedAtIso).toBe("2026-07-01T12:00:00.000Z");
    }
  });

  it("ignores non-finite / non-positive values before applying the cohort floor", () => {
    const r = buildInternalSalaryAggregate(
      [1000, 2000, 3000, Number.NaN, -50, 0],
      opts,
    );
    // Only 3 usable values → small_sample → insufficient_data.
    expect(r.kind).toBe("insufficient_data");
  });
});

describe("SalaryIntelligenceView keeps internal and external separate", () => {
  it("has exactly the two separate fields and never a combined figure", () => {
    const internal = compareSalaryToBenchmark(2400, "gross", benchmark());
    const view: SalaryIntelligenceView = buildSalaryIntelligenceView(
      internal,
      null,
    );
    expect(Object.keys(view).sort()).toEqual(["external", "internal"]);
    expect(view.external).toBeNull();
    expect(view.internal).toBe(internal);
  });
});
