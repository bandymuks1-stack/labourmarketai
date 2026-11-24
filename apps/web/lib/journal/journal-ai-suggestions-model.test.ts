import { describe, expect, it } from "vitest";
import {
  mapWorkJournalSuggestions,
  matchProjectNameToEngagement,
} from "./journal-ai-suggestions-model";

describe("work_journal envelope → journal AI suggestions", () => {
  it("maps skills, achievements, experience and project names with bounds", () => {
    const out = mapWorkJournalSuggestions({
      possible_skills: ["Plytelių klijavimas", "plytelių klijavimas", "  ", "x"],
      suggested_achievements: [
        { title: "Užbaigtas 120 m2 objektas", year: 2026 },
        { title: "ab", year: 2026 }, // too short → dropped
        { title: "Be metų", year: 99 }, // invalid year → null
      ],
      suggested_experience_periods: [
        {
          title: "Plytelių klojėjas — UAB Statyba",
          start_year: 2023,
          end_year: null,
          is_current: true,
        },
      ],
      suggested_project_names: ["Vilniaus objektas"],
    });
    expect(out).not.toBeNull();
    // case-insensitive dedupe + min length 2 filter
    expect(out?.skillLabels).toEqual(["Plytelių klijavimas"]);
    expect(out?.achievements).toEqual([
      { title: "Užbaigtas 120 m2 objektas", year: 2026 },
      { title: "Be metų", year: null },
    ]);
    expect(out?.experiencePeriods).toEqual([
      {
        title: "Plytelių klojėjas — UAB Statyba",
        startYear: 2023,
        endYear: null,
        isCurrent: true,
      },
    ]);
    expect(out?.projectNames).toEqual(["Vilniaus objektas"]);
  });

  it("returns null when the model suggested nothing actionable (honest empty)", () => {
    expect(mapWorkJournalSuggestions({})).toBeNull();
    expect(mapWorkJournalSuggestions(undefined)).toBeNull();
    expect(
      mapWorkJournalSuggestions({ possible_skills: [], suggested_project_names: [] }),
    ).toBeNull();
  });

  it("re-bounds counts so upstream drift can never flood the review UI", () => {
    const out = mapWorkJournalSuggestions({
      possible_skills: Array.from({ length: 40 }, (_, i) => `Skill ${i}`),
      suggested_achievements: Array.from({ length: 20 }, (_, i) => ({
        title: `Achievement ${i}`,
        year: null,
      })),
      suggested_experience_periods: Array.from({ length: 9 }, (_, i) => ({
        title: `Role ${i}`,
        start_year: null,
        end_year: null,
        is_current: false,
      })),
      suggested_project_names: Array.from({ length: 9 }, (_, i) => `Proj ${i}`),
    });
    expect(out?.skillLabels.length).toBe(20);
    expect(out?.achievements.length).toBe(10);
    expect(out?.experiencePeriods.length).toBe(5);
    expect(out?.projectNames.length).toBe(5);
  });

  it("never invents fields: malformed rows are dropped, not repaired", () => {
    const out = mapWorkJournalSuggestions({
      suggested_achievements: [null, 42, { year: 2020 }, { title: 7, year: 2020 }],
      suggested_experience_periods: ["oops"],
    });
    expect(out).toBeNull();
  });
});

describe("project name → engagement matching (worker's OWN contexts only)", () => {
  const engagements = [
    { id: "e1", label: "UAB Statyba · Darbuotojas" },
    { id: "e2", label: "Vilniaus objektas" },
  ];
  it("matches case-insensitively in either containment direction", () => {
    expect(matchProjectNameToEngagement("vilniaus objektas", engagements)).toBe(
      "e2",
    );
    expect(matchProjectNameToEngagement("UAB Statyba", engagements)).toBe("e1");
  });
  it("an unmatched or too-short name yields null (nothing to render)", () => {
    expect(matchProjectNameToEngagement("Kauno aikštelė", engagements)).toBeNull();
    expect(matchProjectNameToEngagement("x", engagements)).toBeNull();
  });
});
