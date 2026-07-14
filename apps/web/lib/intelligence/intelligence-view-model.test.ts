import { describe, it, expect } from "vitest";

import { buildExplanation } from "./explainability";
import { compareSalaryToBenchmark, toSalaryBenchmark } from "./salary-model";
import {
  aggregateSkillDemand,
  computeSupplyDemandGap,
  missingSkillsForRecommendation,
} from "./skills-demand-model";
import {
  buildAgencyIntelligenceCards,
  buildCompanyIntelligenceCards,
  buildWorkerIntelligenceCards,
  INTELLIGENCE_MAX_CARDS,
  INTELLIGENCE_MAX_ITEMS_PER_CARD,
} from "./intelligence-view-model";

function fixtureBenchmark() {
  const built = toSalaryBenchmark({
    valueEur: 2000,
    basis: "gross",
    statMethod: "median",
    geo: { country: "LT", region: null, city: null },
    sampleSize: 12,
    sourceKey: "internal_platform_aggregates",
    sourceKind: "internal_aggregated",
    observedAtIso: "2026-07-01T00:00:00.000Z",
    originKind: "internal",
  });
  if (!built.ok) throw new Error("fixture must build");
  return built.benchmark;
}

describe("buildWorkerIntelligenceCards", () => {
  it("renders a ready salary card with the benchmark's source badge", () => {
    const benchmark = fixtureBenchmark();
    const comparison = compareSalaryToBenchmark(2400, "gross", benchmark);
    const cards = buildWorkerIntelligenceCards({
      salary: { benchmark, comparison },
      recommendations: null,
      skillFreshness: null,
    });
    const salary = cards.find((c) => c.id === "worker-salary");
    expect(salary?.state).toBe("ready");
    expect(salary?.sourceBadge).toEqual({
      originKind: "internal",
      sourceKey: "internal_platform_aggregates",
      observedAtIso: "2026-07-01T00:00:00.000Z",
    });
    expect(salary?.explanation.dataBasisCodes.length).toBeGreaterThan(0);
  });

  it("degrades honestly: no benchmark → insufficient_data; gated store → needs_migration", () => {
    const none = buildWorkerIntelligenceCards({
      salary: null,
      recommendations: null,
      skillFreshness: null,
    });
    expect(none.find((c) => c.id === "worker-salary")?.state).toBe(
      "insufficient_data",
    );

    const gated = buildWorkerIntelligenceCards({
      salary: { benchmark: null, comparison: null, needsMigration: true },
      recommendations: null,
      skillFreshness: null,
    });
    expect(gated.find((c) => c.id === "worker-salary")?.state).toBe(
      "needs_migration",
    );
  });

  it("caps items per card at 8", () => {
    const rec = missingSkillsForRecommendation({
      matchedUris: [],
      missingUris: Array.from({ length: 20 }, (_, i) => `skill-${i}`),
    });
    const cards = buildWorkerIntelligenceCards({
      salary: null,
      recommendations: rec,
      skillFreshness: null,
    });
    const missing = cards.find((c) => c.id === "worker-missing-skills");
    expect(missing?.items).toHaveLength(INTELLIGENCE_MAX_ITEMS_PER_CARD);
    expect(missing?.valueClass).toBe("system_suggestion");
  });
});

describe("buildCompanyIntelligenceCards", () => {
  it("time-to-fill is ALWAYS an insufficient_data card — never a number", () => {
    const cards = buildCompanyIntelligenceCards({
      salaryCompetitiveness: null,
      supplyDemandGaps: [],
      skillScarcity: [],
    });
    const ttf = cards.find((c) => c.id === "company-time-to-fill");
    expect(ttf?.state).toBe("insufficient_data");
    expect(ttf?.headlineParams).toEqual({});
    expect(ttf?.items).toEqual([]);
  });

  it("carries the gap and scarcity value classes through", () => {
    const gap = computeSupplyDemandGap(
      Array.from({ length: 7 }, () => ({
        roleText: "Welder",
        country: "LT",
        city: null,
        teamSize: null,
        createdAtIso: "2026-05-10T00:00:00.000Z",
      })),
      [],
    );
    const scarcity = aggregateSkillDemand(
      Array.from({ length: 6 }, () => ({
        roleText: "Welder",
        country: "LT",
        city: null,
        teamSize: null,
        createdAtIso: "2026-05-10T00:00:00.000Z",
        skillSlugs: ["welding"],
      })),
      { windowStart: "2026-04-01", windowEnd: "2026-06-30" },
    );
    const cards = buildCompanyIntelligenceCards({
      salaryCompetitiveness: null,
      supplyDemandGaps: [gap],
      skillScarcity: scarcity,
    });
    expect(
      cards.find((c) => c.id === "company-supply-demand-gap")?.valueClass,
    ).toBe("calculated_gap");
    const scarcityCard = cards.find((c) => c.id === "company-skill-scarcity");
    expect(scarcityCard?.items.every((i) => i.valueClass === "user_entered")).toBe(
      true,
    );
  });
});

describe("buildAgencyIntelligenceCards", () => {
  const aggregate = (id: string) => ({
    id,
    headlineCode: "intelligence.cards.agency.headline",
    headlineParams: { count: 5 },
    valueClass: "available_capacity" as const,
    explanation: buildExplanation({
      meaningCode: "intelligence.agency.aggregate",
      dataBasisCodes: ["intelligence.basis.tenantAggregates"],
      originKind: "internal",
    }),
  });

  it("maps pre-aggregated inputs to cards and caps the list at 6", () => {
    const cards = buildAgencyIntelligenceCards({
      crossClientAggregates: Array.from({ length: 10 }, (_, i) =>
        aggregate(`agg-${i}`),
      ),
    });
    expect(cards).toHaveLength(INTELLIGENCE_MAX_CARDS);
    expect(cards[0].sourceBadge.originKind).toBe("internal");
  });
});
