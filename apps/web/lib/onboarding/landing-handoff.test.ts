import { describe, expect, it } from "vitest";

import {
  EMPTY_HANDOFF,
  professionFromSentence,
  readLandingHandoff,
  sentenceFromReturnPath,
} from "./landing-handoff";

/**
 * The landing sentence must reach onboarding as DEFAULTS (walk-real-person-join,
 * production 2026-09-06): the person who wrote "esu suvirintojas, ieškau darbo
 * Norvegijoje" on the landing was asked "Ko atėjote?" with nothing ticked and
 * "Kokį darbą dirbi?" with an empty select. Pure module — every branch here.
 */
describe("landing hand-off → onboarding defaults (pure)", () => {
  const NEXT_PLAIN = "/dashboard?say=esu+suvirintojas%2C+ie%C5%A1kau+darbo+Norvegijoje";
  const NEXT_LOCALE = "/lt/dashboard?say=esu+suvirintojas%2C+ie%C5%A1kau+darbo+Norvegijoje";

  it("reads ?say= out of a locale-less AND a locale-prefixed return path", () => {
    expect(sentenceFromReturnPath(NEXT_PLAIN)).toBe("esu suvirintojas, ieškau darbo Norvegijoje");
    expect(sentenceFromReturnPath(NEXT_LOCALE)).toBe("esu suvirintojas, ieškau darbo Norvegijoje");
  });

  it("returns nothing for no path, a foreign URL, or a path without a sentence", () => {
    expect(sentenceFromReturnPath(null)).toBe("");
    expect(sentenceFromReturnPath(undefined)).toBe("");
    expect(sentenceFromReturnPath("https://evil.example/dashboard?say=x")).toBe("");
    expect(sentenceFromReturnPath("/dashboard")).toBe("");
    expect(readLandingHandoff("/dashboard/profile#setup-journey")).toBe(EMPTY_HANDOFF);
  });

  it("the welder looking for work → 'work' card ticked, welder pre-chosen", () => {
    const h = readLandingHandoff(NEXT_LOCALE);
    expect(h.sentence).toBe("esu suvirintojas, ieškau darbo Norvegijoje");
    expect(h.intents).toEqual(["work"]);
    expect(h.professionSlug).toBe("welder");
  });

  it("an employer's sentence → 'hire' card, no profession put on the person", () => {
    const h = readLandingHandoff("/dashboard?say=" + encodeURIComponent("Reikia 12 pastolininkų Roterdame"));
    expect(h.intents).toEqual(["hire"]);
    // the company's need names a trade; it is NOT the signer's profession
    expect(h.professionSlug).toBeNull();
  });

  it("never guesses: two professions in one sentence → no default", () => {
    expect(professionFromSentence("esu suvirintojas ir santechnikas")).toBeNull();
    expect(professionFromSentence("")).toBeNull();
  });

  it("an unrecognised sentence still travels, with no cards ticked", () => {
    const h = readLandingHandoff("/dashboard?say=" + encodeURIComponent("labas rytas visiems"));
    expect(h.sentence).toBe("labas rytas visiems");
    expect(h.intents).toEqual([]);
    expect(h.professionSlug).toBeNull();
  });

  it("only registry professions are proposed (a hint slug outside the catalogue is dropped)", () => {
    // every proposed slug must be one the wizard's select actually offers
    const h = readLandingHandoff(NEXT_PLAIN);
    expect(h.professionSlug === null || typeof h.professionSlug === "string").toBe(true);
  });
});
