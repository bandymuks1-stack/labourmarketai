import { describe, expect, it } from "vitest";

import { classifyIntent } from "./intent-router";
import { INTENT_REGISTRY } from "./intent-registry";

/**
 * "Noriu rasti partnerių savo verslui" was answered as a JOB SEARCH
 * ("Radau 5…", "Man tinkantys darbai") — owner-verified on production
 * 2026-10-01. The sentence scored 0 on the deterministic router, fell to the
 * model proposer, which had no partner intent and picked the nearest door.
 * A business-partner request must never change meaning into job search.
 */
describe("business-partner requests are not job searches", () => {
  it.each([
    "Noriu rasti partnerius savo verslui",
    "Noriu rasti partnerių savo verslui",
    "rasti partnerių",
    "Ieškau partnerių verslui",
    "Ieškau verslo partnerių",
    "Ieškome partnerių savo įmonei",
    "Surask man verslo partnerių",
    "find business partners",
    "I want to find partners for my business",
    "We are looking for business partners",
    "Хочу найти партнёров для бизнеса",
    "Ищу бизнес-партнеров",
    "Ich möchte Geschäftspartner finden",
    "Ich suche Partner für mein Unternehmen",
    "Ik wil zakelijke partners vinden",
    "Ik zoek partners voor mijn bedrijf",
    "Chcę znaleźć partnerów biznesowych",
    "Szukam partnerów do mojej firmy",
  ])("%s → find-partners", (sentence) => {
    expect(classifyIntent(sentence).intent).toBe("find-partners");
  });

  it("is a route-class, company-domain answer — no write, no second marketplace", () => {
    expect(INTENT_REGISTRY["find-partners"]).toMatchObject({
      domain: "company",
      access: "route",
      handler: "findPartners",
    });
  });
});

describe("job and hiring sentences keep their routes (opposite-direction controls)", () => {
  it.each([
    ["Ieškau darbo", "find-work"],
    ["Ieškau darbo pas partnerius", "find-work"],
    ["Ieškau darbo Norvegijoje", "find-work"],
    ["I am looking for a job", "find-work"],
    ["Ich suche Arbeit", "find-work"],
    ["Ищу работу", "find-work"],
  ])("%s → %s", (sentence, intent) => {
    expect(classifyIntent(sentence).intent).toBe(intent);
  });

  it.each(["Reikia suvirintojų", "We need welders", "Reikia 5 pastolininkų"])(
    "%s never reads as partners",
    (sentence) => {
      expect(classifyIntent(sentence).intent).not.toBe("find-partners");
    },
  );
});
