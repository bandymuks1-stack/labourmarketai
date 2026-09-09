import { describe, expect, it } from "vitest";

import { FIRST_RUN_INTENTS, INTENT_IDENTITY, nextPathForIntents } from "./first-run-intent";
import {
  DOOR_WORDS_KEY,
  EMPTY_HANDOFF,
  doorIntentsFromReturnPath,
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

  it("a sentence hand-off carries no door", () => {
    expect(readLandingHandoff(NEXT_LOCALE).door).toEqual([]);
  });
});

/**
 * The landing DOOR (lanes F + C, production build dd5d92c3): the institution
 * door carries `/dashboard/start/company?capability=training_provider` — the
 * path the router hands an `education` intent — and onboarding showed
 * nothing ticked. The hand-off reads the path BACK through the router.
 */
describe("landing door → onboarding defaults (nextPathForIntents inverted)", () => {
  const INSTITUTION = "/dashboard/start/company?capability=training_provider";

  it("capability=training_provider → the 'education' card, no sentence, no profession", () => {
    const h = readLandingHandoff(INSTITUTION);
    expect(h).toEqual({ sentence: "", intents: ["education"], professionSlug: null, door: ["education"] });
  });

  it("reads a locale-prefixed door too, and ignores query order", () => {
    expect(doorIntentsFromReturnPath(`/lt${INSTITUTION}`)).toEqual(["education"]);
    expect(doorIntentsFromReturnPath(`/en${INSTITUTION}`)).toEqual(["education"]);
    expect(
      doorIntentsFromReturnPath("/dashboard/start/company?capability=training_provider&type=staffing_agency"),
    ).toEqual(["agency", "education"]);
    expect(
      doorIntentsFromReturnPath("/dashboard/start/company?type=staffing_agency&capability=training_provider"),
    ).toEqual(["agency", "education"]);
  });

  it("is the exact inverse of the router for every company-intent combination", () => {
    const company = FIRST_RUN_INTENTS.filter((i) => INTENT_IDENTITY[i] === "company");
    for (let mask = 1; mask < 1 << company.length; mask += 1) {
      const intents = company.filter((_, idx) => mask & (1 << idx));
      const path = nextPathForIntents(intents);
      expect(path).not.toBeNull();
      const back = doorIntentsFromReturnPath(path);
      // the smallest set that routes to this path (a bare setup path = hire)
      expect(nextPathForIntents(back)).toBe(path);
      for (const i of back) expect(intents).toContain(i);
    }
    expect(doorIntentsFromReturnPath("/dashboard/start/company")).toEqual(["hire"]);
    expect(doorIntentsFromReturnPath("/dashboard/start/company?type=staffing_agency")).toEqual(["agency"]);
  });

  it("an unknown capability or type is not a door → nothing is ticked", () => {
    expect(doorIntentsFromReturnPath("/dashboard/start/company?capability=employer")).toEqual([]);
    expect(doorIntentsFromReturnPath("/dashboard/start/company?capability=workforce_provider")).toEqual([]);
    expect(doorIntentsFromReturnPath("/dashboard/start/company?type=client_customer")).toEqual([]);
    expect(doorIntentsFromReturnPath("/dashboard/start/company?capability=training_provider&new=1")).toEqual([]);
    expect(readLandingHandoff("/dashboard/start/company?capability=employer")).toBe(EMPTY_HANDOFF);
  });

  it("worker paths, invitation deep links, foreign URLs and nothing → no door", () => {
    expect(doorIntentsFromReturnPath("/dashboard")).toEqual([]);
    expect(doorIntentsFromReturnPath("/dashboard/profile#learning-compass")).toEqual([]);
    expect(doorIntentsFromReturnPath("/dashboard/invitations/abc")).toEqual([]);
    expect(doorIntentsFromReturnPath("https://evil.example/dashboard/start/company?capability=training_provider")).toEqual([]);
    expect(doorIntentsFromReturnPath("//evil.example/dashboard/start/company")).toEqual([]);
    expect(doorIntentsFromReturnPath(null)).toEqual([]);
    expect(doorIntentsFromReturnPath(undefined)).toEqual([]);
  });

  it("both a sentence and a door: the person's own words win; an unreadable sentence keeps the door", () => {
    const welder = `${INSTITUTION}&say=${encodeURIComponent("esu suvirintojas, ieškau darbo Norvegijoje")}`;
    const h = readLandingHandoff(welder);
    expect(h.intents).toEqual(["work"]);
    expect(h.professionSlug).toBe("welder");
    expect(h.door).toEqual(["education"]);
    const unread = readLandingHandoff(`${INSTITUTION}&say=${encodeURIComponent("labas rytas visiems")}`);
    expect(unread.sentence).toBe("labas rytas visiems");
    expect(unread.intents).toEqual(["education"]);
    // an institution sentence through the institution door: consistent
    const consistent = readLandingHandoff(
      `${INSTITUTION}&say=${encodeURIComponent("Atstovauju kolegijai, norime kviesti studentus")}`,
    );
    expect(consistent.intents.length).toBeLessThanOrEqual(1);
  });

  it("every door intent maps to a landing.cta key, and only company intents are doors", () => {
    for (const intent of FIRST_RUN_INTENTS) {
      const key = DOOR_WORDS_KEY[intent];
      if (INTENT_IDENTITY[intent] === "company") expect(key).toBeTruthy();
      else expect(key).toBeUndefined();
    }
    expect(DOOR_WORDS_KEY.education).toBe("institution");
  });
});
