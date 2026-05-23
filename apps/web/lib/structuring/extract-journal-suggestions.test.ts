import { describe, expect, it } from "vitest";
import { extractJournalSuggestions } from "./extract-journal-suggestions";

describe("extractJournalSuggestions (rule-based, LT)", () => {
  it("returns an empty result for blank input", () => {
    const s = extractJournalSuggestions("");
    expect(s.hasAny).toBe(false);
  });

  it("parses hours, m², skills, and a site mention from a typical entry", () => {
    const text =
      "Dirbau 8 valandas. Montavau gipso lubas, padariau apie 35 m², dėjau profilius ir tvarkiau angokraščius. Objektas: Vilnius, Konstitucijos pr. 14.";
    const s = extractJournalSuggestions(text);
    expect(s.time).toEqual({ value: 8, unitSlug: "hours" });
    expect(s.quantity).toEqual({ value: 35, unitSlug: "square_meters" });
    expect(s.skillSlugs).toContain("drywall");
    expect(s.skillSlugs).toContain("ceiling-systems");
    expect(s.siteName).toContain("Vilnius");
    expect(s.hasAny).toBe(true);
  });

  it("recognises days as a time unit when no hours are mentioned", () => {
    const s = extractJournalSuggestions("Dirbau 2 dienas objektuose.");
    expect(s.time).toEqual({ value: 2, unitSlug: "days" });
  });

  it("recognises minutes", () => {
    const s = extractJournalSuggestions("Tvarkiau 45 minutes santechniką.");
    expect(s.time?.unitSlug).toBe("minutes");
    expect(s.time?.value).toBe(45);
  });

  it("returns hasAny=false when no rules match", () => {
    const s = extractJournalSuggestions("aaa bbb ccc");
    expect(s.hasAny).toBe(false);
  });
});
