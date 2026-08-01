/**
 * Opportunity Discovery directions guard (Wave 2; trimmed by W3 Package 4).
 *
 * W3 Package 4 deleted the second dashboard and its OpportunityDirectionsCard
 * surface (plus the opportunityDirections copy). The surviving piece is the
 * pure directions module `lib/opportunities/adjacent-directions.ts`, and its
 * honesty invariants still hold: it reuses the single canonical adjacency
 * map, invents no professions, boosts no sector, and promises no
 * learning/course recommendations.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf-8");

const MODULE = "lib/opportunities/adjacent-directions.ts";

describe("1. reuses the canonical adjacency/skill map", () => {
  it("imports professionsForSkill / skillsForProfession / professionRelatedness from the canonical map", () => {
    const src = read(MODULE);
    expect(src).toMatch(/from "@\/lib\/taxonomy\/profession-skills"/);
    for (const fn of ["professionsForSkill", "skillsForProfession", "professionRelatedness"]) {
      expect(src).toContain(fn);
    }
  });
});

describe("2/3. no second adjacency map, no hardcoded profession list", () => {
  const src = read(MODULE);
  it("declares no PROFESSION_SKILLS map and no professionRelatedness of its own", () => {
    expect(src).not.toMatch(/\bPROFESSION_SKILLS\b\s*[:=]/);
    expect(src).not.toMatch(/function professionRelatedness\b/);
  });
  it("hardcodes no recommended-profession slug array", () => {
    // No inline array of profession slugs (candidates come from the reverse index).
    expect(src).not.toMatch(/\[\s*"(electrician|welder|carpenter|driver|teacher)"/);
  });
});

describe("4. no sector/industry boost", () => {
  it("the ranking carries no sector/industry boost", () => {
    const src = read(MODULE);
    expect(src).not.toMatch(/boost/i);
    expect(src).not.toMatch(/sectorWeight|industryWeight|preferredSector/i);
  });
});

describe("6. no learning/course recommendations (no real source exists)", () => {
  it("the module promises no courses/training", () => {
    const src = read(MODULE);
    expect(src).not.toMatch(/\bcourse\b|\btraining\b|\bcurriculum\b|kursai|kurs\w*|mokymo\s+planas|Schulung/i);
  });
});
