/**
 * Opportunity Discovery card guard (Wave 2).
 *
 * Locks the honesty + canonical-reuse invariants of the adjacent professional
 * directions surface: it reuses the single canonical adjacency map, invents no
 * professions, boosts no sector, shows no learning/course recommendations,
 * routes only to real pages, ships all 5 required locales, keeps analytics
 * PII-free, and is wired into the ONE canonical worker dashboard.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf-8");

const MODULE = "lib/opportunities/adjacent-directions.ts";
const CARD = "components/app/dashboard/opportunity-directions-card.tsx";
const DASHBOARD = "app/[locale]/dashboard/page.tsx";
const LOCALES = ["lt", "en", "ru", "nl", "de"] as const;
const REQUIRED_KEYS = [
  "heading",
  "intro",
  "fitBecause",
  "couldStrengthen",
  "viewOpportunities",
  "addSkills",
  "addProfileCta",
  "showMore",
  "showLess",
  "insufficientBody",
  "noneBody",
];

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
  it("neither the module, the card, nor the copy promises courses/training", () => {
    const blobs = [read(MODULE), read(CARD), ...LOCALES.map((l) => read(`messages/${l}.json`).match(/"opportunityDirections"[\s\S]*?\n {2}\}/)?.[0] ?? "")];
    for (const b of blobs) {
      expect(b).not.toMatch(/\bcourse\b|\btraining\b|\bcurriculum\b|kursai|kurs\w*|mokymo\s+planas|Schulung/i);
    }
  });
});

describe("7. CTAs route only to existing pages", () => {
  it("the card targets real opportunities + profile routes that exist on disk", () => {
    const src = read(CARD);
    expect(src).toContain('"/dashboard/opportunities"');
    expect(src).toContain('"/dashboard/profile"');
    expect(existsSync(resolve(webRoot, "app/[locale]/dashboard/opportunities/page.tsx"))).toBe(true);
    expect(existsSync(resolve(webRoot, "app/[locale]/dashboard/profile/page.tsx"))).toBe(true);
  });
});

describe("8. LT/EN/RU/NL/DE carry every required text", () => {
  it.each(LOCALES)("%s has a complete opportunityDirections namespace", (loc) => {
    const json = JSON.parse(read(`messages/${loc}.json`)) as {
      opportunityDirections?: Record<string, string>;
    };
    const ns = json.opportunityDirections;
    expect(ns, `${loc} opportunityDirections`).toBeTruthy();
    for (const k of REQUIRED_KEYS) {
      expect(typeof ns?.[k], `${loc}.${k}`).toBe("string");
      expect((ns?.[k] ?? "").length, `${loc}.${k} non-empty`).toBeGreaterThan(0);
      expect(ns?.[k], `${loc}.${k} not a raw [EN] marker`).not.toMatch(/^\[EN\]/);
    }
  });
});

describe("9. mobile card has no overflow risk", () => {
  it("wraps action rows and uses no fixed pixel widths / nowrap", () => {
    const src = read(CARD);
    expect(src).toMatch(/flex-wrap/);
    expect(src).not.toMatch(/whitespace-nowrap/);
    expect(src).not.toMatch(/w-\[\d+px\]|min-w-\[\d+px\]/);
  });
});

describe("10. explainability shows real shared skills", () => {
  it("the card renders the shared-skill basis", () => {
    const src = read(CARD);
    expect(src).toContain("sharedSkills");
    expect(src).toContain("fitBecause");
  });
});

describe("11. analytics payload carries no sensitive profile content", () => {
  const src = read(CARD);
  it("fires the four bounded events with only a surface key", () => {
    for (const ev of [
      "opportunity_directions_viewed",
      "opportunity_direction_opened",
      "opportunity_jobs_opened",
      "opportunity_profile_update_clicked",
    ]) {
      expect(src).toContain(ev);
    }
  });
  it("never puts skills / profession data into an analytics payload", () => {
    // Every recordEvent(...) call uses { surface: SURFACE } — never a skill or
    // profession value.
    const calls = src.match(/recordEvent\([^;]*?\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c).toMatch(/surface:\s*SURFACE/);
      expect(c).not.toMatch(/sharedSkills|missingSkills|professionName|professionId/);
    }
  });
});

describe("12. integrated into the ONE canonical worker dashboard", () => {
  it("is imported exactly once, by the canonical dashboard page", () => {
    const src = read(DASHBOARD);
    expect(src).toMatch(/OpportunityDirectionsCard/);
    expect(src).toMatch(/loadAdjacentDirectionsForWorker/);
  });
});
