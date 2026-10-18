import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { readPublicEntry } from "@/lib/marketing/public-entry";

/**
 * SEP-4 AT THE FRONT DOOR: DEMAND ≠ SUPPLY.
 *
 * Measured 2026-09-08 on the PUBLIC ENTRY — the first sentence a visitor ever
 * types, before any account exists. "Ieškau darbo suvirintoju Vokietijoje"
 * classified as `need-workers`: a person looking for a welding job was read as
 * an employer hiring welders, and carried into the hiring flow. The same
 * inversion held in ru, nl and de. Only en escaped, and only by accident — its
 * occupation alternation lists "welder" and the sentence said "welding".
 *
 * The mechanism was not a missing rule. `need-workers` scores 6 for a seek
 * verb near an occupation stem, and that alternation deliberately includes the
 * FIRST-PERSON SINGULAR forms (ieškau / ищу / suche / zoek) so that "Ieškau
 * santechniko" — a person who NEEDS a plumber — is read as demand. Both
 * sentences open with the same word. The discriminator is the object: one
 * seeks a PLUMBER, the other seeks WORK.
 *
 * These tests pin BOTH directions. A fix that repaired the job-seeker by
 * breaking "Ieškau santechniko", or by capturing the agency's first-person
 * PLURAL ("ieškome darbo savo darbuotojams" — capacity offered, not sought),
 * would fail here. That agency inversion was itself a previously fixed bug,
 * which is why it is pinned rather than assumed.
 */

const SUPPLY_SENTENCES: ReadonlyArray<readonly [string, string]> = [
  ["lt", "Ieškau darbo suvirintoju Vokietijoje"],
  ["lt", "Ieškau darbo suvirintojo"],
  ["lt", "Ieškau statybininko darbo Vokietijoje"],
  ["lt", "Ieškau darbo"],
  ["en", "I am looking for a welding job in Germany"],
  ["en", "I am looking for work as an electrician"],
  ["ru", "Ищу работу сварщиком в Германии"],
  ["nl", "Ik zoek werk als lasser in Duitsland"],
  ["nl", "Ik zoek een baan als chauffeur"],
  ["de", "Ich suche Arbeit als Schweißer in Deutschland"],
  ["de", "Ich suche eine Stelle als Elektriker"],
];

/** The same opening verb, but the object is a TRADESPERSON. Demand. */
const DEMAND_FOR_A_TRADE: ReadonlyArray<readonly [string, string]> = [
  ["lt", "Ieškau santechniko"],
  ["ru", "Ищу сантехника"],
  ["de", "Ich suche einen Klempner"],
  ["nl", "Ik zoek een loodgieter"],
];

const EMPLOYER_HEADCOUNT: ReadonlyArray<readonly [string, string]> = [
  ["lt", "Reikia 12 pastolininkų Roterdame nuo spalio 5 d."],
  ["en", "I need 12 scaffolders in Rotterdam from October 5"],
  ["ru", "Нужны 12 монтажников лесов в Роттердаме"],
  ["de", "Ich brauche 12 Gerüstbauer in Rotterdam"],
];

/** First-person PLURAL: an agency with people, offering them. Not a seeker. */
const AGENCY_OFFERS_CAPACITY: ReadonlyArray<readonly [string, string]> = [
  ["lt", "Turime 20 suvirintojų ir ieškome jiems darbo Nyderlanduose"],
  ["en", "We have workers and we are looking for work for our welders"],
];

describe("a person seeking WORK is never read as an employer seeking WORKERS", () => {
  for (const [locale, sentence] of SUPPLY_SENTENCES) {
    it(`${locale}: "${sentence}" is find-work`, () => {
      expect(classifyIntent(sentence).intent).toBe("find-work");
    });
  }

  it("the public entry carries the same reading, in the worker family", () => {
    // The router is only half the surface: the landing turns the reading into
    // a first-run family and carries it through the auth doors. A correct
    // intent landing in the employer family would still send the person to
    // the wrong side of the product.
    for (const [, sentence] of SUPPLY_SENTENCES) {
      const reading = readPublicEntry(sentence);
      expect(reading.kind).toBe("recognised");
      if (reading.kind !== "recognised") continue;
      expect(reading.intent).toBe("find-work");
      expect(reading.family).toBe("work");
    }
  });
});

describe("NEGATIVE CONTROLS — the demand side is not sacrificed to fix supply", () => {
  for (const [locale, sentence] of DEMAND_FOR_A_TRADE) {
    it(`${locale}: "${sentence}" stays employer demand`, () => {
      // Same seek verb, no work noun. This is the sentence the first-person
      // forms were added to `need-workers` for; repairing the job-seeker must
      // not take it away.
      expect(classifyIntent(sentence).intent).toBe("need-workers");
    });
  }

  for (const [locale, sentence] of EMPLOYER_HEADCOUNT) {
    it(`${locale}: "${sentence}" stays employer demand`, () => {
      expect(classifyIntent(sentence).intent).toBe("need-workers");
    });
  }

  for (const [locale, sentence] of AGENCY_OFFERS_CAPACITY) {
    it(`${locale}: "${sentence}" stays offer-capacity`, () => {
      // WE HAVE, not I NEED. This exact inversion was fixed once before, so
      // the direction rule is deliberately first-person SINGULAR only.
      expect(classifyIntent(sentence).intent).toBe("offer-capacity");
    });
  }
});

describe("the direction rule is what decides it, not luck", () => {
  it("wins by a margin over the employer reading it has to beat", () => {
    // "Ieškau darbo suvirintoju" scores 12 on the employer side, because the
    // occupation stem fires TWO weight-6 seek rules at once. A direction rule
    // that merely tied, or won by one, would silently invert again the next
    // time a pattern is added. Verified by mutation: at the original weight
    // the sentence classified as `need-workers`.
    const match = classifyIntent("Ieškau darbo suvirintoju Vokietijoje");
    expect(match.intent).toBe("find-work");
    expect(match.score).toBeGreaterThan(12);
  });

  it("does not fire when there is no work noun to name", () => {
    // The rule must be inert on the sentence it must not touch, rather than
    // firing and being outscored — otherwise its weight is load-bearing in a
    // place it was never reasoned about.
    const plumber = classifyIntent("Ieškau santechniko");
    expect(plumber.intent).toBe("need-workers");
  });
});
