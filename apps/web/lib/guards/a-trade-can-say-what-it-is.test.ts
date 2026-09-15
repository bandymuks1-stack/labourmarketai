import { describe, expect, it } from "vitest";
import { classifyIntent } from "@/lib/conversation/intent-router";

/**
 * A TRADE CAN SAY WHAT IT IS — in every routed language.
 *
 * Owner readiness window, 2026-09-09. §5A's probe list opens with "I am a
 * welder." Measured on this router before the fix, that sentence — and its
 * German, Dutch and Russian equivalents — returned NO intent, while "I am an
 * accountant" was understood in all four. The office professions were in the
 * stem list the `profession-statement` rule read; the manual trades were in
 * `TRADE_STEM_SOURCE`, which it did not read.
 *
 * Lithuanian passed only by accident of grammar ("suvirintojas" ends in
 * `-tojas`, matching the nominative suffix), so the gap was invisible in the
 * language most of the testing happens in — and it hit exactly the people
 * this product exists for.
 *
 * THE HALF THAT MATTERS IS THE SECOND ONE. Widening what a rule accepts is
 * how #1669 became the #1675 regression: a positive test passes and the
 * nearest OPPOSITE meaning quietly moves. Every direction that borders this
 * one is pinned below, and none of them may change.
 */

/** Every routed language, one sentence each, for the same trade. */
const SELF_INTRODUCTION: ReadonlyArray<readonly [string, string]> = [
  ["lt", "Esu suvirintojas"],
  ["en", "I am a welder"],
  ["de", "Ich bin Schweisser"],
  ["nl", "Ik ben lasser"],
  ["ru", "Я сварщик"],
];

/** The trades a person actually types, in English — the catalogue's core. */
const TRADES_EN = [
  "welder",
  "electrician",
  "plumber",
  "carpenter",
  "painter",
  "driver",
  "cook",
  "cleaner",
  "scaffolder",
] as const;

const intentOf = (s: string) => classifyIntent(s)?.intent ?? null;

describe("1. the same trade introduces itself in every routed language", () => {
  it.each(SELF_INTRODUCTION)("%s: %s", (_loc, sentence) => {
    expect(intentOf(sentence)).toBe("profession-statement");
  });

  it.each(TRADES_EN)("a %s can say so", (trade) => {
    expect(intentOf(`I am a ${trade}`)).toBe("profession-statement");
  });

  it("the office professions it always understood are untouched", () => {
    for (const s of [
      "I am an accountant",
      "Esu buhalteris",
      "Ich bin Buchhalter",
      "Ik ben boekhouder",
      "Я бухгалтер",
      "я работаю инженером",
      "dirbau projektų vadovu 5 metus",
    ]) {
      expect(intentOf(s), s).toBe("profession-statement");
    }
  });
});

describe("2. NEGATIVE CONTROLS — the four borders this must not cross", () => {
  /** SEP-4, the direction of the market. An organisation stating how many
   *  people it HAS is supply; stating how many it NEEDS is demand. Neither
   *  contains a first-person-singular anchor, so neither can reach the rule —
   *  but that is a property to assert, not to assume. */
  it("a workforce OFFER is still supply, never a person's self-description", () => {
    for (const s of [
      "We have 20 welders",
      "Turime 20 suvirintoju",
      "We have 12 experienced scaffolders available Monday",
    ]) {
      expect(intentOf(s), s).toBe("offer-capacity");
    }
  });

  it("a workforce NEED is still demand", () => {
    for (const s of [
      "We need 10 welders",
      "Reikia 12 pastoliniku",
      "Wir brauchen 10 Schweisser",
      "Wij hebben 10 lassers nodig",
      "Нам нужны 10 сварщиков",
      "I am looking for a welder",
    ]) {
      expect(intentOf(s), s).toBe("need-workers");
    }
  });

  /** #1675, kept. A number beside a trade is a HEADCOUNT or a DURATION, and
   *  the difference is the whole distinction between an agency and a person.
   *  Widening the self-introduction must not have given the person's own
   *  years a second reading. */
  it("a person's YEARS of experience is still experience, not a self-label", () => {
    for (const s of [
      "I have 3 years of experience as a welder",
      "Turiu 3 metus patirties suvirintoju",
      "I have 10 years of experience as an electrician",
    ]) {
      expect(intentOf(s), s).toBe("experiences");
    }
  });

  /** A sentence that ALSO asks for work keeps the search — the person gets
   *  results, not an acknowledgement of what they are. */
  it("stating a trade AND asking for work still runs the search", () => {
    for (const s of [
      "I am a welder looking for work",
      "Esu suvirintojas, ieskau darbo",
    ]) {
      expect(intentOf(s), s).toBe("find-work");
    }
  });

  /** The exclusion list still holds: a generic person-noun or a piece of
   *  equipment sharing a suffix is not a profession. */
  it("a generic noun after the anchor is still not a profession", () => {
    for (const s of ["esu darbuotojas", "esu studentas", "esu kandidatas"]) {
      expect(intentOf(s), s).not.toBe("profession-statement");
    }
  });
});
