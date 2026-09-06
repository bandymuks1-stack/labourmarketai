import { describe, expect, it } from "vitest";
import { structureValueStatement } from "./value-statement";

/**
 * Real-user fitness walk on production, 2026-09-06 — employer sentences for
 * trades OUTSIDE the 43 manual work types lost their ROLE on the way to the
 * need form: "mano autoservisui reikia 2 mechanikų kitą mėnesį" opened the
 * form with the role EMPTY (headcount 2 read), "reikia buhalterio" the same.
 *
 * The platform already had the recogniser: `PROFESSION_HINTS_LT` (49 canonical
 * professions, multilingual needles) — the SAME lexicon matching uses for
 * demand text (`detectNeedProfession`) and the profile extractor uses for a
 * CV. The value statement now carries `professionSlug` when the closed
 * work-type set misses, so the form can offer the profession's localized
 * name for the person to confirm. `workType` stays null — honest: it is a
 * profession, not a work-category slug.
 */
describe("an employer sentence keeps its role for any canonical profession", () => {
  it("'mano autoservisui reikia 2 mechanikų kitą mėnesį' → auto_mechanic, headcount 2, no invented work type", () => {
    const v = structureValueStatement("mano autoservisui reikia 2 mechanikų kitą mėnesį");
    expect(v.professionSlug).toBe("auto_mechanic");
    expect(v.workType).toBeNull();
    expect(v.headcount).toBe(2);
    expect(v.reasons).toContain("profession:auto_mechanic");
  });

  it.each([
    ["reikia programuotojo", "software_developer"],
    ["ieškome kirpėjos į saloną", "hairdresser"],
    ["mokyklai reikia matematikos mokytojo", "teacher"],
  ])("%s → %s", (sentence, slug) => {
    expect(structureValueStatement(sentence).professionSlug).toBe(slug);
  });

  it("a work-type hit keeps precedence — the profession is only the fallback", () => {
    const v = structureValueStatement("reikia 3 suvirintojų Vilniuje");
    expect(v.workType).toBe("welder");
    expect(v.professionSlug).toBeNull();
  });

  it("the service noun never becomes a profession either", () => {
    const v = structureValueStatement("noriu siūlyti buhalterijos paslaugas");
    expect(v.professionSlug).toBeNull();
    expect(v.subject).toBe("service");
  });

  it("a profession noun after a number counts as a headcount", () => {
    expect(structureValueStatement("reikia 2 mechanikų").headcount).toBe(2);
    expect(structureValueStatement("reikia dviejų programuotojų").headcount).toBe(2);
  });
});
