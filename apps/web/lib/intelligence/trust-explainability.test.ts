import { describe, it, expect } from "vitest";

import { buildTrustReport } from "./trust-explainability";
import { buildFreshness } from "./freshness";
import { detectContradiction, type ComparableSignalV1 } from "./contradiction";

const NOW = Date.parse("2026-07-14T12:00:00Z");

const VALID_INPUT = {
  explanation: {
    meaningCode: "intelligence.salary.comparedToBenchmark",
    dataBasisCodes: ["intelligence.basis.marketRateAverages"],
    originKind: "internal" as const,
  },
  whyVisibleCode: "intelligence.trust.whyVisible.roleMatched",
  observationRefs: ["obs-hash-abc123"],
  freshness: buildFreshness({ observedAtIso: "2026-07-09T12:00:00Z" }, NOW),
  confidence: "medium" as const,
  sourceKeys: ["admin_market_rate_averages"],
  notKnownCodes: ["intelligence.trust.notKnown.grossNetBasis"],
};

describe("buildTrustReport — the seven trust questions", () => {
  it("a valid report answers all seven questions", () => {
    const report = buildTrustReport(VALID_INPUT);
    // 1. what is this
    expect(report.explanation.meaningCode).toBe(
      "intelligence.salary.comparedToBenchmark",
    );
    // 2. why am I seeing it
    expect(report.whyVisibleCode).toBe(
      "intelligence.trust.whyVisible.roleMatched",
    );
    // 3. which observations produced it
    expect(report.observationRefs).toEqual(["obs-hash-abc123"]);
    // 4. how old is it (5 days → deterministic label)
    expect(report.freshness?.ageDays).toBe(5);
    expect(report.freshnessLabel).toEqual({
      code: "intelligence.freshness.updatedDaysAgo",
      params: { days: 5 },
    });
    // 5. how confident is the system
    expect(report.confidence).toBe("medium");
    // 6. which source produced it
    expect(report.sourceKeys).toEqual(["admin_market_rate_averages"]);
    // 7. what is not known
    expect(report.notKnownCodes).toEqual([
      "intelligence.trust.notKnown.grossNetBasis",
    ]);
  });

  it("throws on an empty whyVisibleCode / sourceKeys / invalid confidence", () => {
    expect(() =>
      buildTrustReport({ ...VALID_INPUT, whyVisibleCode: " " }),
    ).toThrow(/whyVisibleCode/);
    expect(() =>
      buildTrustReport({ ...VALID_INPUT, sourceKeys: [] }),
    ).toThrow(/sourceKeys/);
    expect(() =>
      buildTrustReport({
        ...VALID_INPUT,
        confidence: "certain" as never,
      }),
    ).toThrow(/confidence/);
  });

  it("refuses to hide missing observation refs — the gap must be admitted", () => {
    expect(() =>
      buildTrustReport({
        ...VALID_INPUT,
        observationRefs: [],
        notKnownCodes: [],
      }),
    ).toThrow(/notKnownCode/);
    // …but an ADMITTED gap is valid (honest absence).
    const report = buildTrustReport({
      ...VALID_INPUT,
      observationRefs: [],
      notKnownCodes: ["intelligence.trust.notKnown.noObservationStore"],
    });
    expect(report.observationRefs).toEqual([]);
  });

  it("missing freshness renders as the honest unknown label", () => {
    const report = buildTrustReport({ ...VALID_INPUT, freshness: null });
    expect(report.freshness).toBe(null);
    expect(report.freshnessLabel.code).toBe("intelligence.freshness.unknown");
  });

  it("carries an exposed conflict state verbatim (never averaged)", () => {
    const a: ComparableSignalV1 = {
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
    const conflict = detectContradiction(a, {
      ...a,
      valueNumeric: 3000,
      sourceKey: "stat_gov_lt",
      originKind: "external",
    });
    const report = buildTrustReport({ ...VALID_INPUT, conflict });
    expect(report.conflict?.kind).toBe("conflict");
    if (report.conflict?.kind === "conflict") {
      expect(report.conflict.a.valueNumeric).toBe(2000);
      expect(report.conflict.b.valueNumeric).toBe(3000);
    }
  });

  it("still enforces the underlying V1 explanation contract", () => {
    expect(() =>
      buildTrustReport({
        ...VALID_INPUT,
        explanation: { ...VALID_INPUT.explanation, dataBasisCodes: [] },
      }),
    ).toThrow(/dataBasisCodes/);
  });
});
