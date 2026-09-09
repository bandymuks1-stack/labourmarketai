import { describe, expect, it } from "vitest";
import { readProfessionStatement, readRoleLabel } from "./role-label";

/**
 * Professional-language walk on production, 2026-09-06 (build ca96605b):
 * every employer sentence naming an occupation OUTSIDE the closed catalogues
 * opened the need form with the role EMPTY. The role label is the person's
 * own word in the nominative — a suggestion, never a catalogue claim.
 */
describe("readRoleLabel — the occupation an employer named, in the nominative", () => {
  it.each([
    ["Reikia buhalterio.", "Buhalteris", "singular"],
    ["Reikia programinės įrangos kūrėjo.", "Programinės įrangos kūrėjas", "singular"],
    ["Reikia projektų vadovo.", "Projektų vadovas", "singular"],
    ["ieškome pardavimų specialisto Vilniuje", "Pardavimų specialistas", "singular"],
    ["reikia inžinieriaus", "Inžinierius", "singular"],
    ["reikia teisininko", "Teisininkas", "singular"],
    ["reikia dizainerio", "Dizaineris", "singular"],
    ["reikia mokytojo", "Mokytojas", "singular"],
    ["restoranui reikia virėjo Kaune nuo spalio", "Virėjas", "singular"],
    ["reikia suvirintojo nuo spalio", "Suvirintojas", "singular"],
    ["Reikia 2 automechanikų.", "Automechanikas", "plural"],
    ["trūksta keturių suvirintojų", "Suvirintojas", "plural"],
    ["mano autoservisui reikia 2 mechanikų kitą mėnesį", "Mechanikas", "plural"],
    ["ieškau kirpėjos", "Kirpėja", "singular"],
    ["reikia anglų kalbos mokytojo", "Anglų kalbos mokytojas", "singular"],
    ["reikia konsultanto", "Konsultantas", "singular"],
    ["reikia finansų analitiko", "Finansų analitikas", "singular"],
    ["reikia buhalterės", "Buhalterė", "singular"],
    ["reikia dizainerių", "Dizaineris", "plural"],
    ["reikia dazytojo butui", "Dazytojas", "singular"],
  ])("%s → %s (%s)", (sentence, label, number) => {
    const r = readRoleLabel(sentence);
    expect(r?.label).toBe(label);
    expect(r?.grammaticalNumber).toBe(number);
  });

  it("English and Russian professional nouns are carried as typed", () => {
    expect(readRoleLabel("we need an accountant in Vilnius")?.label).toBe("Accountant");
    expect(readRoleLabel("looking for a designer")?.label).toBe("Designer");
    expect(readRoleLabel("нужен бухгалтер")?.label).toBe("Бухгалтер");
  });

  it("a masculine genitive adjective is not carried into the nominative label", () => {
    expect(readRoleLabel("reikia patyrusio suvirintojo")?.label).toBe("Suvirintojas");
  });

  it.each([
    "reikia valymo paslaugų",
    "reikia pagalbos",
    "reikia žmonių",
    "reikia darbuotojų",
    "reikia 5 darbuotojų",
    "reikia kompiuterio",
    "reikia traktoriaus",
    "reikia, kad kas nors sutaisytų stogą",
    "reikia meistro rytoj",
    "ieškau darbo",
    "ieškau buto Vilniuje",
    "noriu siūlyti buhalterijos paslaugas",
    "esu buhalteris",
    "reikia automobilio remonto",
  ])("NOT a role: %s", (sentence) => {
    expect(readRoleLabel(sentence)).toBeNull();
  });
});

describe("readProfessionStatement — 'esu X' / 'dirbu X-u' / 'dirbau X-u N metus'", () => {
  it("'esu buhalteris' is a profession statement with no catalogue slug", () => {
    const r = readProfessionStatement("esu buhalteris, ieškau darbo");
    expect(r?.label).toBe("Buhalteris");
    expect(r?.professionSlug).toBeNull();
    expect(r?.tense).toBe("present");
  });

  it.each([
    ["esu programuotojas", "Programuotojas", "software_developer"],
    ["Esu dėstytojas", "Dėstytojas", "teacher"],
    ["esu elektrikas, ieškau darbo Norvegijoje", "Elektrikas", "electrician"],
    ["esu virėja", "Virėja", "cook"],
    ["dirbu inžinieriumi", "Inžinierius", null],
    ["dirbu vairuotoju", "Vairuotojas", "driver"],
    ["esu buhalterė", "Buhalterė", null],
    ["esu projektų vadovas", "Projektų vadovas", null],
  ])("%s → %s / %s", (sentence, label, slug) => {
    const r = readProfessionStatement(sentence);
    expect(r?.label).toBe(label);
    expect(r?.professionSlug).toBe(slug);
  });

  it("'dirbau projektų vadovu 5 metus' is PAST work history with the years", () => {
    const r = readProfessionStatement("dirbau projektų vadovu 5 metus");
    expect(r?.label).toBe("Projektų vadovas");
    expect(r?.tense).toBe("past");
    expect(r?.years).toBe(5);
  });

  it("English, Russian, Dutch and German statements read the professional noun", () => {
    expect(readProfessionStatement("I am an accountant")?.label).toBe("Accountant");
    expect(readProfessionStatement("я инженер")?.label).toBe("Инженер");
    expect(readProfessionStatement("Ik ben boekhouder")?.label).toBe("Boekhouder");
    // German capitalises every noun — the name guard is Lithuanian-only.
    expect(readProfessionStatement("Ich bin Buchhalter")?.label).toBe("Buchhalter");
    expect(readProfessionStatement("Ich bin Hans")).toBeNull();
  });

  it.each([
    "esu Jonas",
    "esu Ivanovas",
    "esu laisvas rytoj",
    "esu studentas",
    "esu darbuotojas",
    "esu iš Vilniaus",
    "esu pasiruošęs dirbti",
    "dirbau vakar 8 valandas",
    "dirbau nuo 8 iki 17 objekte",
    "dirbu su vaikais",
    "galiu mokytis vakarais",
    "reikia buhalterio",
    "ieškau darbo",
  ])("NOT a profession statement: %s", (sentence) => {
    expect(readProfessionStatement(sentence)).toBeNull();
  });
});
