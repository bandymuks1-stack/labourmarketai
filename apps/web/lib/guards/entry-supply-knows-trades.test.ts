import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { TRADE_STEM_SOURCE } from "@/lib/structuring/role-label";

/**
 * A VOCABULARY ONLY ONE DIRECTION COULD READ.
 *
 * Measured 2026-09-08. The manual-trades list lived INSIDE the employer-demand
 * rule of the router, so the demand side knew every trade and the supply side
 * knew none:
 *
 *   "reikia 12 pastolininkų"   -> need-workers   (understood)
 *   "turime 20 pastolininkų"   -> unknown        (not understood)
 *
 * The same sentence, the same trade, one word different — and only the buying
 * half of the market could speak. A subcontractor's plainest opening ("we
 * have N of this trade", optionally with a date) reached nothing at all.
 *
 * The list is now `TRADE_STEM_SOURCE` in `lib/structuring/role-label.ts`,
 * beside `OCCUPATION_STEM_SOURCE`, and BOTH directions read it.
 */

const SUPPLY: ReadonlyArray<readonly [string, string]> = [
  ["lt", "turime 20 pastolininkų"],
  ["lt", "turim 8 suvirintojus nuo pirmadienio"],
  ["lt", "turime 5 elektrikus"],
  ["lt", "nuo spalio 5 d. laisvi 3 elektrikai"],
  ["en", "we have 20 scaffolders"],
  ["de", "wir haben 12 Schweisser"],
  ["nl", "wij hebben 12 lassers"],
  ["ru", "у нас 20 сварщиков"],
];

const DEMAND: ReadonlyArray<readonly [string, string]> = [
  ["lt", "reikia 12 pastolininkų"],
  ["lt", "reikia 5 suvirintoju"],
  ["en", "need 5 welders next week"],
  ["de", "wir brauchen 12 Schweisser"],
];

describe("both directions read the same trades vocabulary", () => {
  it("the vocabulary is shared, not owned by the demand rule", () => {
    // If this list ever moves back inside one intent, the other direction
    // goes silent again — which is the defect this file exists for.
    expect(TRADE_STEM_SOURCE).toContain("suvirin");
    expect(TRADE_STEM_SOURCE).toContain("pastolinink");
    expect(TRADE_STEM_SOURCE).toContain("scaffolder");
    expect(TRADE_STEM_SOURCE.split("|").length).toBeGreaterThan(50);
  });

  for (const [locale, sentence] of SUPPLY) {
    it(`${locale} SUPPLY: "${sentence}" is offer-capacity`, () => {
      expect(classifyIntent(sentence).intent).toBe("offer-capacity");
    });
  }

  for (const [locale, sentence] of DEMAND) {
    it(`${locale} DEMAND: "${sentence}" is still need-workers`, () => {
      expect(classifyIntent(sentence).intent).toBe("need-workers");
    });
  }
});

describe("NEGATIVE CONTROLS — HAVE + a number is not automatically an offer", () => {
  it("a generic worker count is NOT read as capacity on offer", () => {
    // "Turime 20 darbuotojų" is as likely to be an employer describing its own
    // payroll as an agency offering people. `darbuotoj` is deliberately absent
    // from the trades vocabulary, so this must not become an offer.
    expect(classifyIntent("Turime 20 darbuotojų").intent).not.toBe("offer-capacity");
  });

  it("having things that are not people is not capacity", () => {
    expect(classifyIntent("Turime 3 projektus").intent).not.toBe("offer-capacity");
    expect(classifyIntent("Turiu 2 automobilius").intent).not.toBe("offer-capacity");
  });

  it("a trade with no count is not a capacity statement", () => {
    // The count is what turns a mention of a trade into an offer of people.
    expect(classifyIntent("esu suvirintojas").intent).not.toBe("offer-capacity");
  });

  it("the doors fixed before this one are untouched", () => {
    expect(classifyIntent("Ieškau darbo suvirintoju Vokietijoje").intent).toBe("find-work");
    expect(classifyIntent("im looking for a job as a welder").intent).toBe("find-work");
    expect(classifyIntent("we need people in rotterdam").intent).toBe("need-workers");
    expect(classifyIntent("wij hebben 12 lassers nodig").intent).toBe("need-workers");
    expect(
      classifyIntent("We are a staffing agency looking for 12 welders for our client").intent,
    ).toBe("need-workers");
    expect(
      classifyIntent("We are a training provider and want to register a programme").intent,
    ).toBe("programmes");
  });
});
