import { describe, expect, it } from "vitest";
import { extractJournalSuggestions } from "./extract-journal-suggestions";
import { SKILL_HINTS_LT } from "./keywords";

/**
 * Sector-neutral Work Journal recognition — the surface the journal composer
 * shows (`extractJournalSuggestions` → capability chips + skill slugs + frags).
 * Owner cross-sector smoke (PR #490): the 8 required entries must be recognised
 * across sectors, the ambiguous "svetainės dizainas" must expose BOTH readings
 * (never empty/unknown-only), construction must appear ONLY when the text says
 * so, and a vague entry must stay unknown — never a construction fallback.
 *
 * (The project's universal recogniser core is covered separately in
 * cross-sector-recognition.test.ts; this proves the journal-facing layer.)
 */
const CONSTRUCTION_SLUGS = new Set(SKILL_HINTS_LT.map((r) => r.slug));

function out(text: string) {
  const s = extractJournalSuggestions(text);
  return {
    hours: s.time,
    skills: s.skillSlugs,
    caps: s.capabilitySuggestions.map((c) => c.label),
    capReasons: s.capabilitySuggestions.map((c) => c.reason),
    activityLabels: s.fragments.map((f) => f.activityLabel),
  };
}
function noConstruction(skills: string[]): void {
  for (const slug of skills) expect(CONSTRUCTION_SLUGS.has(slug)).toBe(false);
}

describe("1. 'Dirbau su svetainės dizainu 9 h' — structured ambiguity, no construction", () => {
  const r = out("Dirbau su svetainės dizainu 9 h");
  it("reads 9 hours", () => expect(r.hours).toEqual({ value: 9, unitSlug: "hours" }));
  it("surfaces BOTH website AND interior design readings", () => {
    expect(r.caps).toContain("Interneto svetainės dizainas");
    expect(r.caps).toContain("Interjero dizainas");
  });
  it("is NOT empty / unknown-only", () => expect(r.caps.length).toBeGreaterThan(0));
  it("every suggestion has a text reason", () =>
    expect(r.capReasons.every((x) => typeof x === "string" && x!.length > 0)).toBe(true));
  it("no construction", () => noConstruction(r.skills));
});

describe("2. 'Kūriau interneto svetainės dizainą 9 h' — website design", () => {
  const r = out("Kūriau interneto svetainės dizainą 9 h");
  it("recognizes website/web design", () =>
    expect(r.caps).toContain("Interneto svetainės dizainas"));
  it("does NOT add the interior reading (disambiguated)", () =>
    expect(r.caps).not.toContain("Interjero dizainas"));
  it("no construction", () => noConstruction(r.skills));
});

describe("3. 'Projektavau svetainės kambario interjerą 9 h' — interior design", () => {
  const r = out("Projektavau svetainės kambario interjerą 9 h");
  it("recognizes interior/living-room design", () =>
    expect(r.caps).toContain("Interjero dizainas"));
  it("does NOT add the website reading (disambiguated)", () =>
    expect(r.caps).not.toContain("Interneto svetainės dizainas"));
  it("no construction", () => noConstruction(r.skills));
});

describe("4. 'Montavau langus 9 h' — construction ONLY because the text says so", () => {
  const r = out("Montavau langus 9 h");
  it("recognizes window installation from the text", () => {
    const labels = (r.activityLabels.filter(Boolean) as string[]).join(" | ");
    expect(labels).toMatch(/lang/i); // "Durų ir langų montavimas"
  });
});

describe("5. 'Gaminau lietuviškus patiekalus 6 h' — cooking", () => {
  const r = out("Gaminau lietuviškus patiekalus 6 h");
  it("recognizes cooking/cuisine", () => expect(r.caps).toContain("Maisto gamyba"));
  it("no construction", () => noConstruction(r.skills));
});

describe("6. 'Vairavau CE kategorijos sunkvežimį 10 h' — driving/logistics", () => {
  const r = out("Vairavau CE kategorijos sunkvežimį 10 h");
  it("recognizes driving", () => expect(r.caps).toContain("Vairavimas"));
  it("recognizes the heavy-goods specialization", () =>
    expect(r.caps).toContain("Sunkvežimio vairavimas"));
  it("no construction", () => noConstruction(r.skills));
});

describe("7. 'Vertėjavau iš rusų į lietuvių kalbą 3 h' — translation", () => {
  const r = out("Vertėjavau iš rusų į lietuvių kalbą 3 h");
  it("recognizes language/translation", () => expect(r.caps).toContain("Vertimas"));
  it("no construction", () => noConstruction(r.skills));
});

describe("8. vague unrelated entry — unknown/clarify, never construction fallback", () => {
  const r = out("Dariau visokius dalykus 5 h");
  it("reads the time", () => expect(r.hours).toEqual({ value: 5, unitSlug: "hours" }));
  it("returns no capabilities and no construction (honest unknown)", () => {
    expect(r.caps).toEqual([]);
    noConstruction(r.skills);
  });
});
