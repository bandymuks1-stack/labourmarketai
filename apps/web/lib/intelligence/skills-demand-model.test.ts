import { describe, it, expect } from "vitest";

import {
  aggregateSkillDemand,
  computeSupplyDemandGap,
  detectEmergingSkills,
  INTELLIGENCE_CALC_VERSION,
  missingSkillsForRecommendation,
  type DemandInputRow,
  type SupplyInputRow,
} from "./skills-demand-model";

const WINDOW = { windowStart: "2026-04-01", windowEnd: "2026-06-30" };

function demandRow(over: Partial<DemandInputRow> = {}): DemandInputRow {
  return {
    roleText: "Welder",
    country: "LT",
    city: "Vilnius",
    teamSize: 3,
    createdAtIso: "2026-05-10T10:00:00.000Z",
    skillSlugs: ["welding"],
    ...over,
  };
}

function supplyRow(over: Partial<SupplyInputRow> = {}): SupplyInputRow {
  return {
    professionSlug: "welder",
    country: "LT",
    confirmedSkillSlugs: ["welding"],
    selfDeclaredSkillSlugs: [],
    ...over,
  };
}

describe("aggregateSkillDemand", () => {
  it("is deterministic and applies the cohort policy per bucket", () => {
    const rows = [
      ...Array.from({ length: 6 }, () => demandRow()), // welder LT ×6 → exact
      ...Array.from({ length: 3 }, () =>
        demandRow({ roleText: "Electrician", skillSlugs: [] }),
      ), // ×3 → small_sample
      demandRow({ roleText: "Plumber", skillSlugs: [] }), // ×1 → suppressed
    ];
    const a = aggregateSkillDemand(rows, WINDOW);
    const b = aggregateSkillDemand(rows, WINDOW);
    expect(a).toEqual(b); // same inputs, same output

    const roleBuckets = a.filter(
      (i) => i.metricKey === "demand.role_request_count",
    );
    const welder = roleBuckets.find((i) => i.subjectId === "welder");
    expect(welder?.band).toEqual({ kind: "exact", count: 6 });
    const electrician = roleBuckets.find((i) => i.subjectId === "electrician");
    expect(electrician?.band).toEqual({ kind: "small_sample" });
    // Suppressed bucket never appears at all.
    expect(roleBuckets.some((i) => i.subjectId === "plumber")).toBe(false);

    const skillBuckets = a.filter(
      (i) => i.metricKey === "demand.skill_request_count",
    );
    expect(skillBuckets.find((i) => i.subjectId === "welding")?.band).toEqual({
      kind: "exact",
      count: 6,
    });
  });

  it("every item carries valueClass user_entered, window, version, explanation", () => {
    const rows = Array.from({ length: 5 }, () => demandRow());
    for (const item of aggregateSkillDemand(rows, WINDOW)) {
      expect(item.valueClass).toBe("user_entered");
      expect(item.window).toEqual({
        start: WINDOW.windowStart,
        end: WINDOW.windowEnd,
      });
      expect(item.computationVersion).toBe(INTELLIGENCE_CALC_VERSION);
      expect(item.explanation.meaningCode.length).toBeGreaterThan(0);
      expect(item.explanation.originKind).toBe("internal");
    }
  });

  it("excludes rows outside the window and refuses an inverted window", () => {
    const rows = [
      ...Array.from({ length: 5 }, () => demandRow()),
      ...Array.from({ length: 5 }, () =>
        demandRow({ createdAtIso: "2026-01-01T00:00:00.000Z" }),
      ),
    ];
    const items = aggregateSkillDemand(rows, WINDOW);
    const welder = items.find(
      (i) =>
        i.metricKey === "demand.role_request_count" && i.subjectId === "welder",
    );
    expect(welder?.band).toEqual({ kind: "exact", count: 5 });

    expect(
      aggregateSkillDemand(rows, {
        windowStart: "2026-06-30",
        windowEnd: "2026-04-01",
      }),
    ).toEqual([]);
  });
});

describe("computeSupplyDemandGap", () => {
  it("gap = demand − supply, with per-side value classes", () => {
    const gap = computeSupplyDemandGap(
      Array.from({ length: 7 }, () => demandRow()),
      Array.from({ length: 4 }, () => supplyRow()),
    );
    expect(gap.demand).toEqual({ count: 7, valueClass: "user_entered" });
    expect(gap.supply).toEqual({ count: 4, valueClass: "available_capacity" });
    expect(gap.gap).toBe(3);
    expect(gap.valueClass).toBe("calculated_gap");
    expect(gap.computationVersion).toBe(INTELLIGENCE_CALC_VERSION);
    expect(gap.explanation.uncertaintyCodes).toContain(
      "intelligence.uncertainty.noRoleProfessionJoin",
    );
  });

  it("supports a negative gap (surplus) honestly", () => {
    const gap = computeSupplyDemandGap(
      [demandRow()],
      Array.from({ length: 5 }, () => supplyRow()),
    );
    expect(gap.gap).toBe(-4);
  });
});

describe("detectEmergingSkills", () => {
  const current = { welding: 10, plumbing: 6, painting: 2 };
  const previous = { welding: 5, plumbing: 6, painting: 1 };

  it("refuses without a previous window", () => {
    expect(detectEmergingSkills(current, null)).toEqual({
      kind: "insufficient_window",
    });
    expect(detectEmergingSkills(current, undefined)).toEqual({
      kind: "insufficient_window",
    });
    expect(detectEmergingSkills(null, previous)).toEqual({
      kind: "insufficient_window",
    });
  });

  it("emits only skills with current sample >= minSample (default 5) and real growth", () => {
    const r = detectEmergingSkills(current, previous);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      // painting (n=2) below min sample; plumbing has zero growth.
      expect(r.items.map((i) => i.skillSlug)).toEqual(["welding"]);
      const welding = r.items[0];
      expect(welding.growthPct).toBe(100);
      expect(welding.valueClass).toBe("system_suggestion");
      expect(welding.computationVersion).toBe(INTELLIGENCE_CALC_VERSION);
      expect(welding.explanation.originKind).toBe("internal");
    }
  });

  it("never invents growth from a zero previous count", () => {
    const r = detectEmergingSkills({ welding: 10 }, { plumbing: 3 });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.items).toEqual([]);
  });

  it("respects a custom minSample", () => {
    const r = detectEmergingSkills(
      { welding: 3 },
      { welding: 1 },
      { minSample: 3 },
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.items).toHaveLength(1);
      expect(r.items[0].growthPct).toBe(200);
    }
  });
});

describe("missingSkillsForRecommendation", () => {
  it("passes the canonical FitBasis shape through as a suggestion", () => {
    const r = missingSkillsForRecommendation({
      matchedUris: ["welding"],
      missingUris: ["crane-operation", "scaffolding"],
    });
    expect(r.matchedSlugs).toEqual(["welding"]);
    expect(r.missingSlugs).toEqual(["crane-operation", "scaffolding"]);
    expect(r.valueClass).toBe("system_suggestion");
    expect(r.computationVersion).toBe(INTELLIGENCE_CALC_VERSION);
    expect(r.explanation.nextActionCode).toBe(
      "intelligence.nextAction.logJournalEvidence",
    );
  });
});
