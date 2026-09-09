import { describe, expect, it } from "vitest";
import { classifyIntent } from "./intent-router";

/**
 * Real-user fitness walk on production, 2026-09-06: sentences ordinary people
 * type when they want to OFFER something they can do. Before this, "galiu
 * kirpti plaukus namuose" and "noriu siūlyti buhalterijos paslaugas" both
 * landed in the not-understood menu, although the services door
 * (/dashboard/services) exists for exactly that. The offer verb is bound to
 * the activity in ONE regex so a bare occupation stem keeps its old route.
 */
describe("offering an everyday service routes to offer-value", () => {
  it.each([
    "galiu kirpti plaukus namuose",
    "Galiu mokyti matematikos vaikams",
    "siūlau valyti butus Vilniuje",
    "galiu tvarkyti sodus savaitgaliais",
    "noriu siūlyti buhalterijos paslaugas",
    "teikiu apskaitos paslaugas mažoms įmonėms",
    "I can paint houses and fences",
  ])("%s", (sentence) => {
    expect(classifyIntent(sentence).intent).toBe("offer-value");
  });

  it("diacritic-free typing reaches it too", () => {
    expect(classifyIntent("galiu kirpti plaukus namuose").intent).toBe("offer-value");
    expect(classifyIntent("noriu siulyti buhalterijos paslaugas").intent).toBe("offer-value");
  });

  it("a bare occupation need keeps its employer route (need-workers)", () => {
    expect(classifyIntent("reikia 2 valytojų Kaune").intent).toBe("need-workers");
    expect(classifyIntent("reikia santechniko").intent).toBe("need-workers");
  });

  it("'galiu mokytis' (to learn) is not an offer of a service", () => {
    expect(classifyIntent("galiu mokytis vakarais").intent).not.toBe("offer-value");
  });

  it("'galiu dirbti' (I can work) is not an offer of a service", () => {
    expect(classifyIntent("galiu dirbti nuo pirmadienio").intent).not.toBe("offer-value");
  });

  it("the translate REQUEST stays translate", () => {
    expect(classifyIntent("išversk šį tekstą į anglų kalbą").intent).not.toBe("offer-value");
  });
});

/**
 * PROFESSIONAL LANGUAGE (window 6, production ca96605b measured 2026-09-06):
 * the sentences ordinary professionals and their employers type, each with
 * the door it must reach. Negative pins keep a neighbouring sentence on its
 * old route.
 */
describe("an employer naming ANY profession routes to need-workers", () => {
  it.each([
    "Reikia 2 automechanikų.",
    "Reikia buhalterio.",
    "Reikia programinės įrangos kūrėjo.",
    "Reikia projektų vadovo.",
    "reikia suvirintojo nuo spalio",
    "ieškome pardavimų specialisto Vilniuje",
    "reikia inžinieriaus",
    "reikia teisininko",
    "reikia dizainerio",
    "reikia mokytojo",
    "restoranui reikia virėjo Kaune nuo spalio",
    "reikia dažytojo butui",
    "reikia 2 valytojų",
    "trūksta konsultanto",
    "we need an accountant in Vilnius",
    "нужен бухгалтер",
  ])("%s → need-workers", (sentence) => {
    expect(classifyIntent(sentence).intent).toBe("need-workers");
  });

  it("'Reikia projektų vadovo.' is a need, not the projects list", () => {
    expect(classifyIntent("Reikia projektų vadovo.").intent).not.toBe("projects");
    expect(classifyIntent("parodyk mano projektus").intent).toBe("projects");
  });

  it.each([
    ["reikia kompiuterio", "need-workers"],
    ["reikia traktoriaus", "need-workers"],
    ["reikia pagalbos", "need-workers"],
    ["ieškau darbo Vilniuje", "need-workers"],
    ["ieškau buto Vilniuje", "need-workers"],
  ])("%s is NOT %s", (sentence, notIntent) => {
    expect(classifyIntent(sentence).intent).not.toBe(notIntent);
  });
});

describe("a service asked for by its NAME reaches need-service", () => {
  it.each([
    "reikia valymo paslaugų",
    "reikia automobilio remonto",
    "reikia buto remonto rytoj",
    "ieškau korepetitoriaus paslaugų",
    "need a repair of the roof",
  ])("%s → need-service", (sentence) => {
    expect(classifyIntent(sentence).intent).toBe("need-service");
  });

  it("a named trade keeps its employer route even when it is a service trade", () => {
    expect(classifyIntent("reikia dažytojo butui").intent).toBe("need-workers");
    expect(classifyIntent("reikia valytojo").intent).toBe("need-workers");
  });
});

describe("a person naming their profession or a past job routes to profession-statement", () => {
  it.each([
    "esu buhalteris",
    "esu programuotojas",
    "Esu dėstytojas",
    "dirbu inžinieriumi",
    "dirbau projektų vadovu 5 metus",
    "aš esu elektrikas",
    "esu buhalterė",
    "I am an accountant",
    "я инженер",
  ])("%s → profession-statement", (sentence) => {
    expect(classifyIntent(sentence).intent).toBe("profession-statement");
  });

  it("'dirbau projektų vadovu 5 metus' is work history, not the projects list and not today's journal", () => {
    const r = classifyIntent("dirbau projektų vadovu 5 metus");
    expect(r.intent).not.toBe("projects");
    expect(r.intent).not.toBe("log-work");
  });

  it("a profession stated WITH a job search keeps find-work (the search runs; the profession is read beside it)", () => {
    expect(classifyIntent("esu buhalteris, ieškau darbo").intent).toBe("find-work");
    expect(classifyIntent("esu elektrikas, ieškau darbo Norvegijoje").intent).toBe("find-work");
  });

  it.each([
    "esu laisvas rytoj",
    "esu Jonas",
    "esu studentas",
    "esu darbuotojas",
    "dirbau vakar 8 valandas objekte",
    "dirbau nuo 8 iki 17",
    "šiandien dirbau objekte 8 valandas",
    "galiu mokytis vakarais",
    "esu iš Vilniaus",
  ])("NOT profession-statement: %s", (sentence) => {
    expect(classifyIntent(sentence).intent).not.toBe("profession-statement");
  });

  it("the everyday service offers and requests keep their doors", () => {
    expect(classifyIntent("galiu konsultuoti finansų klausimais").intent).toBe("offer-value");
    expect(classifyIntent("siūlau korepetitoriaus paslaugas").intent).toBe("offer-value");
    expect(classifyIntent("reikia dažytojo butui").intent).toBe("need-workers");
    expect(classifyIntent("reikia valymo paslaugų").intent).toBe("need-service");
  });
});
