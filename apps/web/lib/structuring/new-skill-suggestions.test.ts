import { describe, it, expect } from "vitest";
import {
  recognizeNewSkillSuggestions,
  labelForLocale,
  NEW_SKILL_LIMIT,
} from "./new-skill-suggestions";

describe("recognizeNewSkillSuggestions — cross-sector new-skill discovery", () => {
  it("returns nothing for empty / whitespace text", () => {
    expect(recognizeNewSkillSuggestions("")).toEqual([]);
    expect(recognizeNewSkillSuggestions("   ")).toEqual([]);
  });

  it("suggests a high-confidence NON-construction skill (retail cashier)", () => {
    const out = recognizeNewSkillSuggestions("dirbau kasininku parduotuvėje");
    const cashier = out.find((s) => s.slug === "cashier");
    expect(cashier).toBeTruthy();
    expect(cashier!.confidence).toBe("high");
    expect(cashier!.sector).toBe("retail_sales");
  });

  it("covers many sectors, not just construction", () => {
    const cases: Array<[string, string]> = [
      ["vairavau krautuvą sandėlyje", "forklift-operation"],
      ["gaminau maistą virtuvėje", "cooking"],
      ["dirbau padavėju restorane", "waiting-tables"],
      ["prižiūrėjau senjorus", "elderly-care"],
      ["programavau aplikaciją", "programming"],
      ["tvarkiau apskaitą", "bookkeeping"],
      ["ферма, собирал урожай", "farm-work"],
      ["работал кассиром", "cashier"],
    ];
    for (const [text, slug] of cases) {
      const out = recognizeNewSkillSuggestions(text);
      expect(
        out.some((s) => s.slug === slug),
        `expected ${slug} from "${text}"`,
      ).toBe(true);
    }
  });

  it("EXCLUDES skills the worker already declared (only NEW skills surface)", () => {
    const declared = new Set(["cashier"]);
    const out = recognizeNewSkillSuggestions(
      "dirbau kasininku",
      declared,
    );
    expect(out.some((s) => s.slug === "cashier")).toBe(false);
  });

  it("does NOT duplicate construction skills (those flow from the base engine)", () => {
    // "plyteles" (tiling) is a construction term — the cross-sector catalogue
    // must stay silent on it so we don't double-suggest.
    const out = recognizeNewSkillSuggestions("klijavau plyteles");
    expect(out.every((s) => s.slug !== "tiling")).toBe(true);
  });

  it("caps the number of suggestions", () => {
    const out = recognizeNewSkillSuggestions(
      "kasininku, padavėju, programavau, vairavau krautuvą, gaminau maistą, valytojas, apskaita",
    );
    expect(out.length).toBeLessThanOrEqual(NEW_SKILL_LIMIT);
  });

  it("orders high-confidence before medium", () => {
    const out = recognizeNewSkillSuggestions(
      "dirbau kasininku ir šiek tiek su kodu developer",
    );
    const confidences = out.map((s) => s.confidence);
    // every high must come before every medium
    const firstMedium = confidences.indexOf("medium");
    const lastHigh = confidences.lastIndexOf("high");
    if (firstMedium !== -1 && lastHigh !== -1) {
      expect(lastHigh).toBeLessThan(firstMedium);
    }
  });

  it("resolves labels per locale with EN fallback", () => {
    const out = recognizeNewSkillSuggestions("работал кассиром");
    const cashier = out.find((s) => s.slug === "cashier")!;
    expect(labelForLocale(cashier.labels, "lt")).toBe("Kasininko darbas");
    expect(labelForLocale(cashier.labels, "ru")).toBe("Работа кассиром");
    expect(labelForLocale(cashier.labels, "en")).toBe("Cashier");
    expect(labelForLocale(cashier.labels, "de")).toBe("Cashier"); // fallback
  });

  it("does not match bare 'valymas' (construction site-cleaning overlap)", () => {
    // Generic construction site cleaning must NOT trip the general cleaning
    // services skill — only the cleaner-role stems should.
    const out = recognizeNewSkillSuggestions("valiau statybvietę");
    expect(out.some((s) => s.slug === "cleaning-services")).toBe(false);
  });
});
