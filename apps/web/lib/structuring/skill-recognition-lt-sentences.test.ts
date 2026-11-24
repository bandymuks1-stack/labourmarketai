import { describe, expect, it } from "vitest";
import { recognizeSkills } from "./skill-recognition";

/**
 * systemic-ux-skills-v1 — proof that the work-journal text → skill recognition
 * actually fires for the owner's real Lithuanian test sentences. Before this
 * sprint several of these recognised NOTHING (drainage / ventilation / heating
 * / roofing / scheduling had no needle in the lexicon). These are the exact
 * sentences from the goal spec, used as a regression anchor.
 */

function slugs(text: string): string[] {
  return recognizeSkills(text, 12).map((r) => r.slug);
}

describe("LT journal sentences recognise the expected skills", () => {
  it("nuotekų vamzdžiai + santechnika → plumbing + drainage + pipefitting", () => {
    const s = slugs(
      "Šiandien montavau nuotekų vamzdžius ir pajungiau santechnikos prietaisus.",
    );
    expect(s).toContain("plumbing");
    expect(s).toContain("drainage");
    expect(s).toContain("pipefitting");
  });

  it("vėdinimo sistema + brėžiniai → ventilation + blueprint-reading", () => {
    const s = slugs("Dirbau su vėdinimo sistema ir skaičiau brėžinius.");
    expect(s).toContain("ventilation");
    expect(s).toContain("blueprint-reading");
  });

  it("stogas + medienos darbai → roofing + carpentry", () => {
    const s = slugs("Dengėme stogą, montavome konstrukcijas ir ruošėme medieną.");
    expect(s).toContain("roofing");
    expect(s).toContain("carpentry");
  });

  it("koordinavau komandą → team-coordination", () => {
    const s = slugs("Koordinavau komandą objekte ir pildžiau dokumentus.");
    expect(s).toContain("team-coordination");
  });

  it("derinau grafikus → work-scheduling", () => {
    const s = slugs(
      "Ieškojau darbuotojų, derinau grafikus ir bendravau su klientu.",
    );
    expect(s).toContain("work-scheduling");
  });

  it("recognition is diacritic-insensitive (no LT letters still matches)", () => {
    // Same as sentence 2 but written without Lithuanian diacritics.
    const s = slugs("Dirbau su vedinimo sistema ir skaiciau brezinius.");
    expect(s).toContain("ventilation");
    expect(s).toContain("blueprint-reading");
  });
});
