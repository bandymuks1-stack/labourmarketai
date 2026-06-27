import { describe, expect, it } from "vitest";
import { extractProfileSuggestions } from "./extract-profile-suggestions";

describe("extractProfileSuggestions (rule-based, LT)", () => {
  it("returns an empty result for blank input", () => {
    const s = extractProfileSuggestions("");
    expect(s.hasAny).toBe(false);
  });

  it("parses years of experience, team size, skills and a role hint", () => {
    const text =
      "8 metus dirbau vidaus apdailoje, montavau gipso lubas, dėjau grindis, tvarkiau santechniką, vadovavau 4 žmonių komandai.";
    const s = extractProfileSuggestions(text);
    expect(s.yearsOfExperience).toBe(8);
    expect(s.teamSize).toBe(4);
    expect(s.skillSlugs).toContain("drywall");
    expect(s.skillSlugs).toContain("flooring");
    expect(s.skillSlugs).toContain("plumbing");
    expect(s.skillSlugs).toContain("ceiling-systems");
    expect(s.workDirectionSlugs).toContain("tiler");
    expect(s.cvEntries.length).toBeGreaterThan(0);
    expect(s.hasAny).toBe(true);
  });
});

describe("extractProfileSuggestions: washing a floor is never floor-laying (#23 sibling path)", () => {
  // Owner rule: a wrong signal is worse than no signal. The profile-narrative
  // extractor shares the ambiguous "grind" / "floor" / "пол" needle with the
  // journal recogniser, so the SAME deterministic cleaning-context guard
  // (skill-recognition.isCleaningFloorContext) must suppress the flooring trade
  // here too — otherwise a cleaner's narrative ("ploviau grindis") would falsely
  // claim a floor-laying construction skill.
  const CLEANING = [
    "ploviau grindis",
    "išploviau grindis biure",
    "valiau grindis kabinete",
    "siurbiau ir ploviau grindis",
    "мыл полы в офисе",
    "mopped the floor every morning",
  ];
  for (const text of CLEANING) {
    it(`"${text}" → no flooring / floor-laying skill`, () => {
      expect(extractProfileSuggestions(text).skillSlugs).not.toContain("flooring");
    });
  }

  it("real floor INSTALLATION in a narrative still triggers flooring", () => {
    for (const text of [
      "dėjau grindis",
      "klojau parketą",
      "dėjau laminatą",
      "montavau grindis",
    ]) {
      expect(extractProfileSuggestions(text).skillSlugs, text).toContain("flooring");
    }
  });

  it("unknown cleaning text with no floor noun stays safe-empty (no invented skill)", () => {
    expect(extractProfileSuggestions("tampiau šiukšles ir tvarkiau").skillSlugs).toEqual([]);
  });
});
