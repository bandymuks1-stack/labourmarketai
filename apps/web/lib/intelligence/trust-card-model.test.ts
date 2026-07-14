import { describe, it, expect } from "vitest";

import {
  buildCompanyDemandTrustCard,
  buildOpportunityInsightRow,
  buildTrustCard,
  buildUnavailableTrustCard,
  buildWorkerSalaryTrustCard,
  disabledSourceKeysFor,
  TRUST_INSIGHT_KINDS,
  trustCardTitleCode,
} from "./trust-card-model";
import { buildTrustReport } from "./trust-explainability";
import { detectContradiction, type ComparableSignalV1 } from "./contradiction";
import type { SalaryBenchmarkV1, SalaryComparisonResult } from "./salary-model";
import type { DemandAggregateItem } from "./skills-demand-model";
import { buildExplanation } from "./explainability";

const NOW = Date.parse("2026-07-14T12:00:00Z");

const BENCHMARK: SalaryBenchmarkV1 = {
  valueEur: 2100,
  basis: "unknown",
  period: "month",
  statMethod: "mean",
  geo: { country: "LT", region: null, city: null },
  sampleSize: null, // curated source — no sample by design
  sourceKey: "admin_market_rate_averages",
  sourceKind: "internal_aggregated",
  observedAtIso: "2026-07-09T08:00:00Z",
  originKind: "internal",
  uncertaintyCodes: ["intelligence.uncertainty.curatedNoSampleSize"],
};

const COMPARED: SalaryComparisonResult = {
  kind: "compared",
  positionPct: -8,
  band: "below",
  explanation: buildExplanation({
    meaningCode: "intelligence.salary.comparedToBenchmark",
    dataBasisCodes: ["intelligence.basis.marketRateAverages"],
    geoLabel: "LT",
    sampleSize: null,
    originKind: "internal",
    uncertaintyCodes: ["intelligence.uncertainty.curatedNoSampleSize"],
  }),
};

const VALID_REPORT = buildTrustReport({
  explanation: COMPARED.explanation,
  whyVisibleCode: "intelligence.trust.whyVisible.roleMatched",
  observationRefs: [],
  confidence: "unknown",
  sourceKeys: ["admin_market_rate_averages"],
  notKnownCodes: ["intelligence.trust.notKnown.noObservationStore"],
});

describe("buildTrustCard — status/payload consistency is enforced", () => {
  it("refuses a ready card without a report and an unavailable card with one", () => {
    expect(() =>
      buildTrustCard({ id: "x", kind: "demand", status: "ready" }),
    ).toThrow(/requires a report/);
    expect(() =>
      buildTrustCard({
        id: "x",
        kind: "demand",
        status: "unavailable",
        report: VALID_REPORT,
        unavailable: {
          reasonCode: "r",
          requirementCode: "q",
          disabledSourceKeys: [],
          afterActivationCode: "a",
        },
      }),
    ).toThrow(/must not carry a report/);
  });

  it("refuses an unavailable card missing any of the honest answers", () => {
    expect(() =>
      buildTrustCard({
        id: "x",
        kind: "demand",
        status: "unavailable",
        unavailable: {
          reasonCode: "r",
          requirementCode: " ",
          disabledSourceKeys: [],
          afterActivationCode: "a",
        },
      }),
    ).toThrow(/requires reason, requirement and after-activation/);
  });

  it("refuses conflict status when the report carries no conflict", () => {
    expect(() =>
      buildTrustCard({
        id: "x",
        kind: "salary_benchmark",
        status: "conflict",
        headlineCode: "h",
        report: VALID_REPORT,
      }),
    ).toThrow(/requires the report to carry a conflict/);
  });

  it("accepts conflict status when the report exposes a real conflict", () => {
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
    const report = buildTrustReport({
      explanation: COMPARED.explanation,
      whyVisibleCode: "intelligence.trust.whyVisible.roleMatched",
      observationRefs: [],
      confidence: "unknown",
      sourceKeys: ["internal_platform_aggregates", "stat_gov_lt"],
      notKnownCodes: ["intelligence.trust.notKnown.noObservationStore"],
      conflict,
    });
    const card = buildTrustCard({
      id: "x",
      kind: "salary_benchmark",
      status: "conflict",
      headlineCode: "intelligence.cards.salary.band.below",
      report,
    });
    expect(card.status).toBe("conflict");
    // Both original values ride along verbatim — no averaged third value.
    if (card.report?.conflict?.kind === "conflict") {
      expect(card.report.conflict.a.valueNumeric).toBe(2000);
      expect(card.report.conflict.b.valueNumeric).toBe(3000);
    } else {
      throw new Error("expected an exposed conflict");
    }
  });
});

describe("unavailable defaults — the four honest answers, never 'coming soon'", () => {
  it("every kind builds a complete unavailable card", () => {
    for (const kind of TRUST_INSIGHT_KINDS) {
      const card = buildUnavailableTrustCard(kind);
      expect(card.status).toBe("unavailable");
      expect(card.report).toBeNull();
      expect(card.titleCode).toBe(trustCardTitleCode(kind));
      const u = card.unavailable!;
      expect(u.reasonCode).toMatch(/^intelligence\.trustCard\.reason\./);
      expect(u.requirementCode).toMatch(/^intelligence\.trustCard\.requirement\./);
      expect(u.afterActivationCode).toBe(
        "intelligence.trustCard.after.activation",
      );
      // Sources named as disabled must be REAL registry keys, all inactive.
      expect(u.disabledSourceKeys.length).toBeGreaterThan(0);
    }
  });

  it("disabledSourceKeysFor names only registry sources that are not active", () => {
    for (const kind of TRUST_INSIGHT_KINDS) {
      const keys = disabledSourceKeysFor(kind);
      // Today every mapped external source is proposed-only → all listed.
      expect(keys.length).toBeGreaterThan(0);
      expect(keys).not.toContain("internal_platform_aggregates");
    }
  });
});

describe("buildWorkerSalaryTrustCard", () => {
  it("compared benchmark → ready card with a full trust report + real timeline", () => {
    const card = buildWorkerSalaryTrustCard(
      { benchmark: BENCHMARK, comparison: COMPARED },
      NOW,
    );
    expect(card.status).toBe("ready");
    expect(card.headlineCode).toBe("intelligence.cards.salary.band.below");
    expect(card.headlineParams).toEqual({ positionPct: -8 });
    const report = card.report!;
    // Curated benchmark: no sample, no provenance chain → honestly unknown.
    expect(report.confidence).toBe("unknown");
    expect(report.freshness?.ageDays).toBe(5);
    expect(report.sourceKeys).toEqual(["admin_market_rate_averages"]);
    expect(report.notKnownCodes).toContain(
      "intelligence.trust.notKnown.noObservationStore",
    );
    // Timeline uses ONLY real timestamps: the entry date and render time.
    expect(card.timeline).not.toBeNull();
    expect(card.timeline!.stages.map((s) => s.stage)).toEqual([
      "observation",
      "insight",
      "visible",
    ]);
    expect(card.timeline!.firstTimestampIso).toBe(BENCHMARK.observedAtIso);
  });

  it("missing benchmark → honest unavailable card asking for a curated rate", () => {
    for (const input of [null, { benchmark: null, comparison: null }]) {
      const card = buildWorkerSalaryTrustCard(input, NOW);
      expect(card.status).toBe("unavailable");
      expect(card.report).toBeNull();
      expect(card.unavailable!.reasonCode).toBe(
        "intelligence.trustCard.reason.salaryNoBenchmark",
      );
      expect(card.unavailable!.requirementCode).toBe(
        "intelligence.trustCard.requirement.salaryBenchmark",
      );
    }
  });

  it("existing benchmark + refused comparison → the REAL reason, never 'no rate exists'", () => {
    // basis unknown/mismatch: the rate exists — saying otherwise would lie.
    const basisCard = buildWorkerSalaryTrustCard(
      {
        benchmark: BENCHMARK,
        comparison: {
          kind: "not_comparable",
          reasonCode: "basis_unknown",
        } as SalaryComparisonResult,
      },
      NOW,
    );
    expect(basisCard.status).toBe("unavailable");
    expect(basisCard.unavailable!.reasonCode).toBe(
      "intelligence.trustCard.reason.salaryBasisNotComparable",
    );
    expect(basisCard.unavailable!.requirementCode).toBe(
      "intelligence.trustCard.requirement.salaryBasis",
    );

    // missing own inputs next to an existing rate → the inputs reason.
    const inputsCard = buildWorkerSalaryTrustCard(
      {
        benchmark: BENCHMARK,
        comparison: {
          kind: "insufficient_data",
          missingCodes: ["intelligence.missing.subjectSalary"],
        } as SalaryComparisonResult,
      },
      NOW,
    );
    expect(inputsCard.status).toBe("unavailable");
    expect(inputsCard.unavailable!.reasonCode).toBe(
      "intelligence.trustCard.reason.salaryInputsMissing",
    );
    expect(inputsCard.unavailable!.requirementCode).toBe(
      "intelligence.trustCard.requirement.salaryInputs",
    );
  });
});

describe("buildCompanyDemandTrustCard", () => {
  const AGG: DemandAggregateItem = {
    metricKey: "demand.role.count",
    subjectId: "electrician",
    country: "LT",
    band: { kind: "exact", count: 7 },
    valueClass: "user_entered",
    window: { start: "2026-04-15", end: "2026-07-14" },
    computationVersion: "calc-v1",
    explanation: buildExplanation({
      meaningCode: "intelligence.demand.requestCount",
      dataBasisCodes: ["intelligence.basis.customerRequests"],
      originKind: "internal",
    }),
  };

  it("aggregates → ready card; sample = sum of exact band counts", () => {
    const card = buildCompanyDemandTrustCard(
      {
        demandAggregates: [AGG, { ...AGG, subjectId: "plumber", band: { kind: "small_sample" } }],
        windowStart: "2026-04-15",
        windowEnd: "2026-07-14",
      },
      NOW,
    );
    expect(card.status).toBe("ready");
    // exact 7 ≥ cohort floor 5, fresh, confirmed internal, 1 derivation step
    expect(card.report!.confidence).toBe("medium");
    expect(card.report!.sourceKeys).toEqual(["internal_platform_aggregates"]);
    // Several buckets → the first-bucket-only explanation is DISCLOSED.
    expect(card.report!.notKnownCodes).toContain(
      "intelligence.trust.notKnown.demandMultiBucket",
    );
    expect(card.timeline!.stages.map((s) => s.stage)).toEqual([
      "aggregation",
      "insight",
      "visible",
    ]);
  });

  it("only small-sample bands → confidence honestly unknown (no invented sample)", () => {
    const card = buildCompanyDemandTrustCard(
      {
        demandAggregates: [{ ...AGG, band: { kind: "small_sample" } }],
        windowStart: "2026-04-15",
        windowEnd: "2026-07-14",
      },
      NOW,
    );
    expect(card.status).toBe("ready");
    expect(card.report!.confidence).toBe("unknown");
    // One bucket → no multi-bucket limitation is claimed.
    expect(card.report!.notKnownCodes).not.toContain(
      "intelligence.trust.notKnown.demandMultiBucket",
    );
  });

  it("no aggregates → unavailable with the own-rows reason", () => {
    const card = buildCompanyDemandTrustCard(null, NOW);
    expect(card.status).toBe("unavailable");
    expect(card.unavailable!.reasonCode).toBe(
      "intelligence.trustCard.reason.demandNoOwnRows",
    );
  });
});

describe("buildOpportunityInsightRow — the five market-context cards", () => {
  it("salary card + four honest unavailable placeholders, in a fixed order", () => {
    const row = buildOpportunityInsightRow(
      { benchmark: BENCHMARK, comparison: COMPARED },
      NOW,
    );
    expect(row.map((c) => c.kind)).toEqual([
      "salary_benchmark",
      "demand",
      "supply",
      "skill_gap",
      "market_trend",
    ]);
    expect(row[0].status).toBe("ready");
    for (const card of row.slice(1)) {
      expect(card.status).toBe("unavailable");
      expect(card.unavailable).not.toBeNull();
    }
  });

  it("no deterministic data anywhere → ALL five degrade honestly", () => {
    const row = buildOpportunityInsightRow(null, NOW);
    expect(row.every((c) => c.status === "unavailable")).toBe(true);
    expect(row.every((c) => c.report === null)).toBe(true);
  });
});
