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
