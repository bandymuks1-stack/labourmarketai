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

/**
 * PROFESSIONAL LANGUAGE (window 6, production ca96605b measured 2026-09-06).
 * The eleven employer sentences of the walk, each with what the need form
 * must be offered: the role in the person's own words when both closed
 * catalogues miss (`roleLabel`, nominative), the headcount the grammar
 * states, the start date the time parser reads, the city.
 */
describe("an employer sentence for a profession OUTSIDE both catalogues keeps its role label", () => {
  const TODAY = "2026-09-06";

  it.each([
    ["Reikia buhalterio.", "Buhalteris"],
    ["Reikia projektų vadovo.", "Projektų vadovas"],
    ["ieškome pardavimų specialisto Vilniuje", "Pardavimų specialistas"],
    ["reikia inžinieriaus", "Inžinierius"],
    ["reikia teisininko", "Teisininkas"],
    ["reikia dizainerio", "Dizaineris"],
  ])("%s → roleLabel %s, no invented work type or profession", (sentence, label) => {
    const v = structureValueStatement(sentence, TODAY);
    expect(v.roleLabel).toBe(label);
    expect(v.workType).toBeNull();
    expect(v.professionSlug).toBeNull();
    expect(v.axis).toBe("seek");
    expect(v.subject).toBe("workforce");
  });

  it("'Reikia programinės įrangos kūrėjo.' reaches the catalogue developer through the ONE lexicon", () => {
    const v = structureValueStatement("Reikia programinės įrangos kūrėjo.", TODAY);
    expect(v.professionSlug).toBe("software_developer");
    expect(v.roleLabel).toBe("Programinės įrangos kūrėjas");
  });

  it("a bare singular occupation is a need for ONE person; a plural without a number stays open", () => {
    expect(structureValueStatement("restoranui reikia virėjo Kaune nuo spalio", TODAY).headcount).toBe(1);
    expect(structureValueStatement("Reikia buhalterio.", TODAY).headcount).toBe(1);
    expect(structureValueStatement("reikia suvirintojų", TODAY).headcount).toBeNull();
    expect(structureValueStatement("Reikia 2 automechanikų.", TODAY).headcount).toBe(2);
  });

  it("'nuo spalio' / 'kitą mėnesį' / 'rytoj' reach the start date through the ONE time parser", () => {
    const oct = structureValueStatement("reikia suvirintojo nuo spalio", TODAY);
    expect(oct.window?.kind).toBe("from_date");
    expect(oct.window?.startIso).toBe("2026-10-01");
    const cook = structureValueStatement("restoranui reikia virėjo Kaune nuo spalio", TODAY);
    expect(cook.window?.startIso).toBe("2026-10-01");
    expect(cook.city).toBe("Kaunas");
    expect(cook.country).toBe("LT");
    const nextMonth = structureValueStatement("mano autoservisui reikia 2 mechanikų kitą mėnesį", TODAY);
    expect(nextMonth.window?.kind).toBe("next_month");
    expect(nextMonth.window?.startIso).toBe("2026-10-01");
    expect(structureValueStatement("reikia dažytojo rytoj", TODAY).window?.startIso).toBe("2026-09-07");
    expect(structureValueStatement("reikia dažytojo nuo rugsėjo 15", TODAY).window?.startIso).toBe("2026-09-15");
  });

  it("NEGATIVE: the service noun, generic people and equipment never become a role", () => {
    expect(structureValueStatement("reikia valymo paslaugų", TODAY).roleLabel).toBeNull();
    expect(structureValueStatement("noriu siūlyti buhalterijos paslaugas", TODAY).roleLabel).toBeNull();
    expect(structureValueStatement("reikia 5 darbuotojų", TODAY).roleLabel).toBeNull();
    expect(structureValueStatement("reikia kompiuterio", TODAY).roleLabel).toBeNull();
    expect(structureValueStatement("reikia kompiuterio", TODAY).subject).toBeNull();
    // "paslaugas" must never read as the care assistant (prod 2026-09-06).
    expect(structureValueStatement("noriu siūlyti buhalterijos paslaugas", TODAY).workType).toBeNull();
    expect(structureValueStatement("reikia valymo paslaugų", TODAY).workType).not.toBe("care_assistant");
  });
});
