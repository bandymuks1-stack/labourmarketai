import { describe, expect, it } from "vitest";
import { extractJournalSuggestions } from "./extract-journal-suggestions";

/**
 * Owner-smoke regression (fix/owner-smoke-map-skills-journal-edit-v1, bug 2).
 *
 * The Work Journal must read EXPLICITLY-NAMED skills/specializations from the
 * worker's free text as self-declared, unverified capability suggestions — and
 * must NOT flatten a specialization into only its generic parent. The journal
 * now reuses the SAME capability dictionary as the profile composer, so the
 * examples the owner smoke flagged as missed are recognised here.
 */

function labels(text: string): string[] {
  return extractJournalSuggestions(text).capabilitySuggestions.map((c) => c.label);
}

describe("journal capability extraction — specialization is preserved", () => {
  it("'lietuviškos virtuvės gamyba' yields BOTH parent and specialization", () => {
    const out = labels("Šiandien gaminau lietuviškos virtuvės patiekalus.");
    // The owner's exact flattening complaint: must NOT be only the parent.
    expect(out).toContain("Maisto gamyba");
    expect(out).toContain("Lietuviškos virtuvės gamyba");
  });

  it("does not collapse the wood specialization either", () => {
    const out = labels("Drožiau iš medžio dekoracijas.");
    expect(out).toContain("Medienos apdirbimas");
    expect(out).toContain("Drožyba");
  });
});

describe("journal capability extraction — owner-named capabilities are captured", () => {
  // One broad, realistic Lithuanian entry touching every flagged domain.
  const broad =
    "Šiandien vairavau lengvąjį automobilį po objektus, vežiojau medžiagas. " +
    "Po pietų dirbau pardavimuose — pardaviau klientams paslaugas. " +
    "Montavau santechniką vonioje. Ruošiau sutartis ir tvarkiau dokumentus. " +
    "Automatizavau dalį proceso, motyvavau komandą ir daug bendravau su klientais. " +
    "Vakare gaminau lietuviškos virtuvės patiekalus.";

  const got = labels(broad);

  it.each([
    ["driving (specialization)", "Lengvojo automobilio vairavimas"],
    ["driving (parent)", "Vairavimas"],
    ["sales / seller", "Pardavimai"],
    ["plumbing / sanitary install", "Santechnikos montavimas"],
    ["legal / document preparation", "Sutarčių ruošimas"],
    ["document handling", "Dokumentų tvarkymas"],
    ["automation", "Automatizavimas"],
    ["motivation", "Motyvavimas"],
    ["communication", "Komunikacija"],
    ["culinary specialization", "Lietuviškos virtuvės gamyba"],
  ])("captures %s", (_name, label) => {
    expect(got).toContain(label);
  });
});

describe("journal capability extraction — no invention", () => {
  it("does not surface unrelated capabilities not present in the text", () => {
    const out = labels("Šiandien gaminau lietuviškos virtuvės patiekalus.");
    // Cooking-only text must not yield driving / sales / legal capabilities.
    expect(out).not.toContain("Vairavimas");
    expect(out).not.toContain("Pardavimai");
    expect(out).not.toContain("Sutarčių ruošimas");
  });

  it("empty / whitespace text yields nothing", () => {
    expect(labels("")).toEqual([]);
    expect(labels("   ")).toEqual([]);
  });
});

describe("journal extraction — website-design entry exposes ambiguity (owner smoke)", () => {
  // "Dirbau su svetainės dizainu 9 h" = "I worked on svetainė design for 9 h",
  // where LT "svetainė" = website OR living room. Must read the time, must NOT
  // guess construction, and must surface BOTH design readings as a clarification
  // (never empty/unknown-only, never silently one).
  const s = extractJournalSuggestions("Dirbau su svetainės dizainu 9 h");

  it("reads the 9-hour duration", () => {
    expect(s.time).toEqual({ value: 9, unitSlug: "hours" });
  });
  it("suggests NO construction skills", () => {
    expect(s.skillSlugs).toEqual([]);
    expect(s.skillSuggestions).toEqual([]);
  });
  it("surfaces BOTH design readings as structured ambiguity (not empty)", () => {
    const labels = s.capabilitySuggestions.map((c) => c.label);
    expect(labels).toContain("Interneto svetainės dizainas");
    expect(labels).toContain("Interjero dizainas");
    expect(s.capabilitySuggestions.length).toBeGreaterThan(0);
    expect(s.capabilitySuggestions.every((c) => c.reason && c.reason.length > 0)).toBe(true);
  });
});
