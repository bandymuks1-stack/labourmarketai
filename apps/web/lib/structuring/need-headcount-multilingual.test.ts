import { describe, expect, it } from "vitest";

import { structureNeed, WORK_TYPE_RULES } from "./structure-need";

/**
 * EMPLOYER HEADCOUNT — the number an employer types must survive the language
 * they type it in.
 *
 * `structureNeed` is the deterministic engine behind the employer's real need
 * form (`demand-request-button.tsx` pre-fills the structured selects from the
 * free text on entering the criteria step). So when it loses a field, the
 * employer does not see a bug — they see a form that did not fill in the one
 * number their request is about.
 *
 * The count used to be recognised by two hand-written lists, both anchored in
 * the wrong language: English occupation nouns, and a demand-verb list holding
 * the Russian "ищем" but not the Lithuanian "ieškome". The measured
 * consequence, in a Lithuanian-first product, was that "Нужны 5 сварщиков"
 * kept its 5 while "Ieškome 6 ..." lost its 6.
 */

describe("employer headcount survives the employer's language", () => {
  // Each row is one real way an employer states the same thing. The count is
  // the assertion; the work type and country are asserted where the taxonomy
  // covers them, so a regression in either is visible here too.
  const cases: readonly {
    text: string;
    teamSize: number;
    workType?: string;
    country?: string;
  }[] = [
    // The owner's own example sentence.
    {
      text: "Reikia 4 suvirintojų Vokietijoje, pradžia skubiai, apgyvendinimas suteikiamas.",
      teamSize: 4,
      workType: "welder",
      country: "DE",
    },
    // Same need, a different and equally ordinary Lithuanian verb. This is the
    // one that silently lost its count.
    {
      text: "Ieškome 6 suvirintojų Norvegijoje nuo kitos savaitės.",
      teamSize: 6,
      workType: "welder",
      country: "NO",
    },
    { text: "Ieškau 2 elektrikų Vilniuje.", teamSize: 2, workType: "electrician", country: "LT" },
    {
      text: "Reikalingi 8 mūrininkai Švedijoje.",
      teamSize: 8,
      workType: "mason",
      country: "SE",
    },
    // Russian: the verb worked, the occupation-noun path did not.
    {
      text: "Нужны 5 сварщиков в Германии, жильё предоставляется.",
      teamSize: 5,
      workType: "welder",
      country: "DE",
    },
    { text: "Ищу 3 электриков в Норвегии.", teamSize: 3, workType: "electrician", country: "NO" },
    // English — must keep working exactly as before.
    {
      text: "We need 3 welders in Germany starting urgently, accommodation provided.",
      teamSize: 3,
      workType: "welder",
      country: "DE",
    },
    {
      text: "Looking for 12 warehouse workers in the Netherlands.",
      teamSize: 12,
      workType: "warehouse_worker",
      country: "NL",
    },
  ];

  for (const c of cases) {
    it(`reads the headcount from: ${c.text}`, () => {
      const s = structureNeed({ description: c.text });
      expect(s.teamSize).toBe(c.teamSize);
      expect(s.reasons).toContain(`team_size:${c.teamSize}`);
      if (c.workType) expect(s.workType).toBe(c.workType);
      if (c.country) expect(s.country).toBe(c.country);
    });
  }

  it("a Lithuanian city resolves in the case Lithuanian actually writes it in", () => {
    // "Vilnius" is the dictionary form nobody types; "Vilniuje" is the one
    // every employer types. The city needles were nominative, so the product's
    // own leading language was the one that failed to resolve a bare city.
    for (const [text, code] of [
      ["Reikia 2 elektrikų Vilniuje.", "LT"],
      ["Darbai Kaune, reikia 3 dažytojų.", "LT"],
      ["Objektas Klaipėdoje.", "LT"],
      ["Objektas Vilniaus rajone.", "LT"],
    ] as const) {
      expect(structureNeed({ description: text }).country, text).toBe(code);
    }
  });

  it("NEGATIVE CONTROL: no number means no headcount, in any language", () => {
    for (const text of [
      "Reikia suvirintojų Vokietijoje.",
      "Нужны сварщики в Германии.",
      "We need welders in Germany.",
    ]) {
      const s = structureNeed({ description: text });
      expect(s.teamSize, text).toBeNull();
      expect(s.reasons.some((r) => r.startsWith("team_size:")), text).toBe(false);
    }
  });

  it("NEGATIVE CONTROL: a number next to an UNRECOGNISED occupation is not a headcount", () => {
    // "betonuotojas" (concreter) is genuinely absent from the closed work-type
    // taxonomy. The engine must say so rather than borrow the number — an
    // unrecognised occupation may not lend its noun to a count.
    const s = structureNeed({ description: "Ieškome 6 betonuotojų Norvegijoje." });
    expect(s.workType).toBeNull();
    expect(s.needsReview).toBe(true);
    // The demand verb still legitimately carries the count — that path is
    // language-agnostic and does not depend on recognising the occupation.
    expect(s.teamSize).toBe(6);
  });

  it("NEGATIVE CONTROL: the occupation needle must be ADJACENT to the number", () => {
    // The occupation is recognised and a number appears in the same sentence,
    // but the number is not counting the occupation. Nothing may attach them.
    const s = structureNeed({
      description: "Suvirintojų darbas vyksta 12 valandų pamainomis.",
    });
    expect(s.workType).toBe("welder");
    expect(s.teamSize).toBeNull();
  });

  it("the count rule is derived from the taxonomy, not from a parallel list", () => {
    // The point of the fix: adding an occupation or a language to
    // WORK_TYPE_RULES must improve counting with no edit to the counter. Prove
    // it against a needle chosen from the table at runtime rather than typed
    // into this test.
    const painter = WORK_TYPE_RULES.find((r) => r.slug === "painter");
    expect(painter).toBeDefined();
    for (const needle of painter?.needles ?? []) {
      const s = structureNeed({ description: `objektas: 7 ${needle}ai` });
      expect(s.teamSize, `needle "${needle}"`).toBe(7);
    }
  });
});
