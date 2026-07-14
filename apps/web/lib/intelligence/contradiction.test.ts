import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  contradictionLabelCode,
  DEFAULT_CONFLICT_TOLERANCE_PCT,
  detectContradiction,
  divergencePct,
  type ComparableSignalV1,
} from "./contradiction";

const BASE: ComparableSignalV1 = {
  subjectKind: "profession",
  subjectId: "electrician",
  metricKey: "salary.month.gross",
  unit: "eur_month_gross",
  statMethod: "median",
  geo: { country: "LT", region: null, city: null },
  window: { start: "2026-06-01", end: "2026-06-30" },
  valueNumeric: 2000,
  sourceKey: "internal_platform_aggregates",
  originKind: "internal",
};

function external(valueNumeric: number): ComparableSignalV1 {
  return {
    ...BASE,
    valueNumeric,
    sourceKey: "stat_gov_lt",
    originKind: "external",
  };
}

describe("detectContradiction — internal vs external signal", () => {
  it("agreement within the tolerance", () => {
    const result = detectContradiction(BASE, external(2100));
    expect(result.kind).toBe("agreement");
    if (result.kind === "agreement") {
      expect(result.divergencePct).toBeLessThanOrEqual(
        DEFAULT_CONFLICT_TOLERANCE_PCT,
      );
    }
  });

  it("conflict beyond the tolerance exposes BOTH signals verbatim", () => {
    const b = external(3000);
    const result = detectContradiction(BASE, b);
    expect(result.kind).toBe("conflict");
    if (result.kind !== "conflict") return;
    expect(result.a.valueNumeric).toBe(2000);
    expect(result.b.valueNumeric).toBe(3000);
    // The conflict result carries no third, blended number anywhere.
    expect(Object.keys(result).sort()).toEqual(
      ["a", "b", "divergencePct", "kind"].sort(),
    );
  });

  it("identical values agree with 0 divergence (also both-zero)", () => {
    expect(detectContradiction(BASE, external(2000))).toEqual({
      kind: "agreement",
      divergencePct: 0,
    });
    const zeroA = { ...BASE, valueNumeric: 0 };
    const zeroB = { ...external(0) };
    expect(detectContradiction(zeroA, zeroB).kind).toBe("agreement");
  });

  it("mismatched identity is not_comparable with the exact reason — not a conflict", () => {
    const cases: ReadonlyArray<
      readonly [Partial<ComparableSignalV1>, string]
    > = [
      [{ subjectId: "plumber" }, "subject_mismatch"],
      [{ metricKey: "salary.month.net" }, "metric_mismatch"],
      [{ unit: "eur_month_net" }, "unit_mismatch"],
      [{ statMethod: "mean" }, "stat_method_mismatch"],
      [{ geo: { country: "LV", region: null, city: null } }, "geo_mismatch"],
      [
        { window: { start: "2026-01-01", end: "2026-01-31" } },
        "window_disjoint",
      ],
    ];
    for (const [override, reasonCode] of cases) {
      expect(detectContradiction(BASE, { ...external(2000), ...override }))
        .toEqual({ kind: "not_comparable", reasonCode });
    }
  });

  it("non-finite values are not_comparable, never compared", () => {
    expect(
      detectContradiction(BASE, external(Number.NaN)),
    ).toEqual({ kind: "not_comparable", reasonCode: "non_finite_value" });
  });

  it("custom tolerance is honoured deterministically", () => {
    expect(detectContradiction(BASE, external(2100), 1).kind).toBe("conflict");
    expect(detectContradiction(BASE, external(2100), 50).kind).toBe(
      "agreement",
    );
  });
});

describe("divergencePct", () => {
  it("percent of the larger magnitude, 1-decimal rounding", () => {
    expect(divergencePct(2000, 3000)).toBe(33.3);
    expect(divergencePct(3000, 2000)).toBe(33.3);
    expect(divergencePct(0, 0)).toBe(0);
  });
});

describe("never average conflicting data", () => {
  it("the module exports no averaging/blending function and never computes a mean", () => {
    const src = readFileSync(join(__dirname, "contradiction.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    // ("blended" as an originKind literal is fine — blending VALUES is not.)
    expect(src).not.toMatch(/\baverag|\bmean\s*\(/i);
    expect(src).not.toMatch(/\(\s*[ab]\.valueNumeric\s*\+\s*[ab]\.valueNumeric\s*\)\s*\/\s*2/);
  });

  it("label codes are stable intelligence.conflict.* codes", () => {
    expect(
      contradictionLabelCode({ kind: "agreement", divergencePct: 0 }),
    ).toBe("intelligence.conflict.agreement");
    expect(
      contradictionLabelCode({
        kind: "not_comparable",
        reasonCode: "geo_mismatch",
      }),
    ).toBe("intelligence.conflict.notComparable");
    expect(
      contradictionLabelCode(
        detectContradiction(BASE, external(9999)),
      ),
    ).toBe("intelligence.conflict.conflict");
  });
});
