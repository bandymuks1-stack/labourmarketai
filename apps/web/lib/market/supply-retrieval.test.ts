import { describe, expect, it } from "vitest";

import type { MatchNeed } from "@/lib/market/match-v1";
import {
  explicitIdsReport,
  planSupplyRetrieval,
  selectPoolIds,
  STAGE1_ID_SCAN_CAP,
  SUPPLY_POOL_BUDGET,
  TIER_WEIGHT,
  type TierResult,
} from "@/lib/market/supply-retrieval";

/**
 * W10 slice 3 — Stage 1 planning/selection guards.
 *
 * These pin the two properties the old newest-200 retrieval could not offer:
 * the pool is derived from the DEMAND, and it is DETERMINISTIC. Registration
 * time is not an input to either function, which is the point.
 */

const need = (over: Partial<MatchNeed> = {}): MatchNeed => ({
  skillIds: [],
  escoSkillUris: [],
  professionSlug: null,
  country: null,
  ...over,
});

describe("planSupplyRetrieval", () => {
  it("carries the demand's skills, profession and country into the plan", () => {
    const plan = planSupplyRetrieval(
      need({
        skillIds: ["welding", "steel-fixing"],
        professionSlug: "welder",
        country: "nl",
      }),
    );
    expect(plan.skillSlugs).toEqual(["steel-fixing", "welding"]);
    expect(plan.professionSlug).toBe("welder");
    expect(plan.countryCode).toBe("NL");
    expect(plan.demandDriven).toBe(true);
    expect(plan.budget).toBe(SUPPLY_POOL_BUDGET);
  });

  it("is deterministic — same need, same plan", () => {
    const input = need({ skillIds: ["welding", "welding", "steel-fixing"], country: "NL" });
    expect(planSupplyRetrieval(input)).toEqual(planSupplyRetrieval(input));
  });

  it("drops values that fail their charset bound instead of passing them to SQL", () => {
    const plan = planSupplyRetrieval(
      need({
        // PostgREST filter metacharacters, an over-long slug, and an empty term.
        skillIds: ["welding", "we*ld,ing", "a".repeat(80), "", "OK-Slug"],
        professionSlug: "welder)or(1=1",
        country: "NL' or true --",
      }),
    );
    expect(plan.skillSlugs).toEqual(["ok-slug", "welding"]);
    expect(plan.professionSlug).toBeNull();
    expect(plan.countryCode).toBeNull();
  });

  it("skips the location tier when the country field is free text, not a code", () => {
    // The engine compares country loosely in memory; the SQL tier refuses to
    // guess. The worker is still reachable through the backfill.
    expect(planSupplyRetrieval(need({ country: "Netherlands" })).countryCode).toBeNull();
  });

  it("reports demandDriven=false when nothing usable can be derived", () => {
    const plan = planSupplyRetrieval(need());
    expect(plan.demandDriven).toBe(false);
    expect(plan.skillSlugs).toEqual([]);
  });

  it("bounds the number of terms one demand can push into a predicate", () => {
    const many = Array.from({ length: 200 }, (_, i) => `skill-${i}`);
    expect(planSupplyRetrieval(need({ skillIds: many })).skillSlugs.length).toBeLessThanOrEqual(40);
  });
});

describe("selectPoolIds", () => {
  const tier = (t: TierResult["tier"], ids: string[], truncated = false): TierResult => ({
    tier: t,
    ids,
    truncated,
  });

  it("retrieves multi-signal workers before single-signal ones", () => {
    const { ids } = selectPoolIds([
      tier("skill", ["w-skill", "w-both"]),
      tier("location", ["w-both", "w-loc"]),
      tier("backfill", ["w-none"]),
    ]);
    // w-both (skill+location=5) > w-skill (4) > w-loc (1) > w-none (0)
    expect(ids).toEqual(["w-both", "w-skill", "w-loc", "w-none"]);
  });

  it("orders equals by id, never by insertion or recency", () => {
    const { ids } = selectPoolIds([tier("skill", ["w-c", "w-a", "w-b"])]);
    expect(ids).toEqual(["w-a", "w-b", "w-c"]);
  });

  it("returns the identical pool on repeated runs", () => {
    const tiers = [tier("skill", ["w-3", "w-1"]), tier("location", ["w-2", "w-1"])];
    expect(selectPoolIds(tiers).ids).toEqual(selectPoolIds(tiers).ids);
  });

  it("never returns a duplicate, even when every tier names the same worker", () => {
    const { ids, report } = selectPoolIds([
      tier("skill", ["w-1", "w-1"]),
      tier("profession", ["w-1"]),
      tier("location", ["w-1"]),
      tier("backfill", ["w-1"]),
    ]);
    expect(ids).toEqual(["w-1"]);
    expect(report.poolSize).toBe(1);
  });

  it("counts a repeat inside ONE tier once, so a duplicated row cannot inflate weight", () => {
    const { ids } = selectPoolIds([
      tier("skill", ["w-dup", "w-dup", "w-dup"]),
      tier("skill", ["w-single"]),
      tier("location", ["w-single"]),
    ]);
    // w-single = skill(4) + location(1) = 5 beats w-dup = skill(4) counted once.
    expect(ids).toEqual(["w-single", "w-dup"]);
  });

  it("spends the budget on demand-matched workers before the backfill", () => {
    const { ids, report } = selectPoolIds(
      [
        tier("skill", ["w-match-1", "w-match-2"]),
        tier("backfill", ["w-bf-1", "w-bf-2", "w-bf-3"]),
      ],
      3,
    );
    expect(ids).toEqual(["w-match-1", "w-match-2", "w-bf-1"]);
    expect(report.matchedByDemand).toBe(2);
    expect(report.backfilled).toBe(1);
    expect(report.capped).toBe(true);
  });

  it("reports capped=false when everything retrievable fits", () => {
    const report = selectPoolIds([tier("skill", ["a", "b"])], 10).report;
    expect(report.capped).toBe(false);
    expect(report.poolSize).toBe(2);
  });

  it("reports a truncated stage instead of hiding an incomplete tier", () => {
    const report = selectPoolIds([tier("skill", ["a"], true)]).report;
    expect(report.truncatedStages).toEqual(["skill"]);
  });

  it("keeps the backfill weightless so it can never outrank a demand signal", () => {
    expect(TIER_WEIGHT.backfill).toBe(0);
    expect(TIER_WEIGHT.skill).toBeGreaterThan(TIER_WEIGHT.profession);
    expect(TIER_WEIGHT.profession).toBeGreaterThan(TIER_WEIGHT.location);
    expect(TIER_WEIGHT.location).toBeGreaterThan(TIER_WEIGHT.backfill);
  });

  it("keeps the stage-1 row ceiling well above the pool budget", () => {
    expect(STAGE1_ID_SCAN_CAP).toBeGreaterThan(SUPPLY_POOL_BUDGET);
  });
});

describe("explicitIdsReport", () => {
  it("reports capped when the caller asked for more workers than the budget allows", () => {
    const report = explicitIdsReport(["a", "b", "c"], ["a", "b"], 2);
    expect(report.strategy).toBe("explicit_ids");
    expect(report.capped).toBe(true);
    expect(report.poolSize).toBe(2);
    expect(report.backfilled).toBe(0);
  });
});
