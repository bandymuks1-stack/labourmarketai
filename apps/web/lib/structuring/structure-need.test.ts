import { describe, it, expect } from "vitest";
import { structureNeed } from "./structure-need";
import { ALL_WORK_TYPE_SLUGS, MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";

const ACCOMMODATION = new Set([
  "provided_free",
  "provided_paid",
  "provided_deducted",
  "not_provided",
]);
const START = new Set(["flexible", "this_week", "urgent"]);

describe("structureNeed — deterministic, closed-set, honest", () => {
  it("structures a clear English need into safe fields", () => {
    const s = structureNeed({
      description: "We need 5 welders in Germany with accommodation next month",
    });
    expect(s.workType).toBe("welder");
    expect(s.country).toBe("DE");
    expect(s.teamSize).toBe(5);
    expect(s.startPeriod).toBe("flexible"); // "next month"
    expect(s.accommodation).toBe("provided_free");
    expect(s.confidence).toBe("high");
    expect(s.needsReview).toBe(false);
  });

  it("structures a Lithuanian need too", () => {
    const s = structureNeed({
      role: "Reikia 3 santechnikų",
      location: "Vilnius",
      description: "skubu, su apgyvendinimu",
    });
    expect(s.workType).toBe("plumber");
    expect(s.country).toBe("LT");
    expect(s.teamSize).toBe(3);
    expect(s.startPeriod).toBe("urgent");
    expect(s.accommodation).toBe("provided_free");
  });

  it("flags an unclear need for review (no bold guess)", () => {
    const s = structureNeed({ description: "we need some good people soon, details later" });
    expect(s.workType).toBeNull();
    expect(s.needsReview).toBe(true);
    expect(s.confidence).toBe("low");
  });

  it("detects a country from a city name without a country word", () => {
    const s = structureNeed({ role: "warehouse worker", location: "Rotterdam" });
    expect(s.workType).toBe("warehouse_worker");
    expect(s.country).toBe("NL");
  });

  it("maps 'no accommodation' to not_provided", () => {
    const s = structureNeed({ description: "cleaner in Oslo, no accommodation" });
    expect(s.accommodation).toBe("not_provided");
    expect(s.country).toBe("NO");
    expect(s.workType).toBe("cleaner");
  });

  it("NEVER lets free text / contacts leak into any field", () => {
    const s = structureNeed({
      role: "welder John Smith",
      description: "call +37060000000 or email boss@acme.com, 2 welders in Riga",
      notes: "secret internal note, address Some Street 5",
    });
    const values = [s.workType, s.country, s.startPeriod, s.accommodation].filter(
      (v): v is string => typeof v === "string",
    );
    for (const v of values) {
      expect(v).not.toMatch(/@|\+?\d{6,}|smith|street|secret/i);
    }
    // Every string output is a closed-set token.
    if (s.workType) expect(ALL_WORK_TYPE_SLUGS).toContain(s.workType);
    if (s.country) expect(MARKET_COUNTRIES).toContain(s.country as never);
  });

  it("only ever returns closed-set values across many inputs", () => {
    const inputs = [
      "5 truck drivers CE to Netherlands urgent",
      "cooks and kitchen helpers needed in Copenhagen",
      "10 farm workers, harvest season, Poland, housing deducted",
      "forklift operator Tallinn",
      "нужно 4 сварщика в Германии с жильём",
      "random gibberish xyz",
    ];
    for (const text of inputs) {
      const s = structureNeed({ description: text });
      if (s.workType !== null) expect(ALL_WORK_TYPE_SLUGS).toContain(s.workType);
      if (s.country !== null) expect(MARKET_COUNTRIES).toContain(s.country as never);
      if (s.accommodation !== null) expect(ACCOMMODATION.has(s.accommodation)).toBe(true);
      if (s.startPeriod !== null) expect(START.has(s.startPeriod)).toBe(true);
      if (s.teamSize !== null) {
        expect(Number.isInteger(s.teamSize)).toBe(true);
        expect(s.teamSize).toBeGreaterThanOrEqual(1);
        expect(s.teamSize).toBeLessThanOrEqual(1000);
      }
    }
  });
});
