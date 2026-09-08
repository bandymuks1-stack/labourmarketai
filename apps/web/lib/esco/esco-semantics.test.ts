import { describe, expect, it } from "vitest";

import * as semantics from "./esco-semantics";

import {
  compareEscoMatches,
  dedupeByConcept,
  ESCO_IS_NOT,
  ESCO_LABEL_RANK,
  isDisplayableLabel,
  isSafeLabelMatch,
  type EscoLabelMatch,
} from "./esco-semantics";

const m = (over: Partial<EscoLabelMatch> = {}): EscoLabelMatch => ({
  conceptId: "c1",
  conceptType: "skill",
  matchedLabel: "welding",
  matchedLocale: "en",
  labelType: "preferred",
  method: "exact_label",
  ...over,
});

describe("ESCO label evidence order", () => {
  it("a preferred label outranks an alternative, which outranks a hidden one", () => {
    expect(ESCO_LABEL_RANK.preferred).toBeGreaterThan(ESCO_LABEL_RANK.alternative);
    expect(ESCO_LABEL_RANK.alternative).toBeGreaterThan(ESCO_LABEL_RANK.hidden);
    const sorted = [
      m({ conceptId: "h", labelType: "hidden" }),
      m({ conceptId: "p", labelType: "preferred" }),
      m({ conceptId: "a", labelType: "alternative" }),
    ].sort(compareEscoMatches);
    expect(sorted.map((x) => x.conceptId)).toEqual(["p", "a", "h"]);
  });

  it("an exact label beats a prefix hit at the same tier", () => {
    const sorted = [
      m({ conceptId: "prefix", method: "prefix_label", matchedLabel: "weld" }),
      m({ conceptId: "exact", method: "exact_label", matchedLabel: "weld" }),
    ].sort(compareEscoMatches);
    expect(sorted[0].conceptId).toBe("exact");
  });

  it("the order is TOTAL and stable — identical inputs never reshuffle", () => {
    // An unstable order makes a suggestion list flicker between identical
    // inputs, which reads to a person as the system changing its mind.
    const input = [
      m({ conceptId: "b", matchedLabel: "welding steel" }),
      m({ conceptId: "a", matchedLabel: "welding iron" }),
      m({ conceptId: "c", matchedLabel: "welding" }),
    ];
    const once = [...input].sort(compareEscoMatches).map((x) => x.conceptId);
    const twice = [...input].sort(compareEscoMatches).map((x) => x.conceptId);
    const reversed = [...input].reverse().sort(compareEscoMatches).map((x) => x.conceptId);
    expect(once).toEqual(twice);
    expect(once).toEqual(reversed);
  });
});

describe("dedupeByConcept", () => {
  it("one concept matched by several of its labels is ONE finding", () => {
    // "scaffolder (construction)" and "scaffolding labourer" are the same
    // occupation. Two rows would imply two findings where there is one.
    const out = dedupeByConcept([
      m({ conceptId: "scaffolder", matchedLabel: "scaffolding labourer", labelType: "alternative" }),
      m({ conceptId: "scaffolder", matchedLabel: "scaffolder", labelType: "preferred" }),
    ]);
    expect(out).toHaveLength(1);
    // and it keeps the STRONGEST statement of the meaning
    expect(out[0].labelType).toBe("preferred");
    expect(out[0].matchedLabel).toBe("scaffolder");
  });

  it("distinct concepts are never merged, even with identical text", () => {
    // The foreman and the erector are different occupations that share words.
    const out = dedupeByConcept([
      m({ conceptId: "erector", conceptType: "occupation" }),
      m({ conceptId: "foreman", conceptType: "occupation" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("the same id under different concept types stays two concepts", () => {
    const out = dedupeByConcept([
      m({ conceptId: "x", conceptType: "skill" }),
      m({ conceptId: "x", conceptType: "occupation" }),
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("hidden labels recognise but never name", () => {
  it("a hidden label is not displayable", () => {
    // ESCO's hidden labels are misspellings and deprecated forms. Echoing
    // "ability to descalate" back as the name of a competency would make a
    // real concept look like a typo.
    expect(isDisplayableLabel("hidden")).toBe(false);
    expect(isDisplayableLabel("preferred")).toBe(true);
    expect(isDisplayableLabel("alternative")).toBe(true);
  });
});

describe("what an ESCO concept is NOT", () => {
  it("the disclaimer list names every claim a code must not become", () => {
    // This list is the guard rail as a value. If someone shrinks it, the
    // reason should have to survive a failing test rather than a code review.
    for (const claim of [
      "evidence",
      "verification",
      "formal qualification",
      "recognised equivalence",
      "credential",
      "authorisation",
      "how good",
    ]) {
      expect(
        ESCO_IS_NOT.some((s) => s.includes(claim)),
        `the list must still deny: ${claim}`,
      ).toBe(true);
    }
  });

  it("the module exposes no way to ask what skill a person HAS", () => {
    // Structural, not stylistic: this layer resolves meaning and stops. A
    // function returning a person's skills would be the collapse SEP-3 forbids.
    const names = Object.keys(semantics).join(" ").toLowerCase();
    for (const forbidden of ["hasskill", "personskill", "verify", "qualif", "score"]) {
      expect(names).not.toContain(forbidden);
    }
  });
});

describe("isSafeLabelMatch — the two measured false positives", () => {
  it("rejects the SKILL false positive measured on production", () => {
    // "montuoti" (to install) → "montuoti ekranus" = mount visual displays.
    // A formwork installer must never be told their work denotes that.
    expect(isSafeLabelMatch("montuoti", "montuoti ekranus")).toBe(false);
  });

  it("rejects the OCCUPATION false positive measured on production", () => {
    // A construction painter is not a glass painter.
    expect(isSafeLabelMatch("painter", "painter on glass")).toBe(false);
  });

  it("accepts the parenthetical sense, which is a real and needed match", () => {
    // "scaffolder" has NO exact ESCO label; its real one is this. Production
    // carries a real supply row for scaffolders in Norway.
    expect(isSafeLabelMatch("scaffolder", "scaffolder (construction)")).toBe(true);
    expect(isSafeLabelMatch("scaffolder", "scaffolder(construction)")).toBe(true);
  });

  it("accepts an exact label, whatever the casing or padding", () => {
    expect(isSafeLabelMatch("welder", "welder")).toBe(true);
    expect(isSafeLabelMatch("  Welder ", "WELDER")).toBe(true);
  });

  it("continuing a term with more WORDS is never safe", () => {
    // The general form of both measured failures: more words change what a
    // term denotes; a bracket only says which sense is meant.
    expect(isSafeLabelMatch("welder", "welder helper")).toBe(false);
    expect(isSafeLabelMatch("cook", "cook chill technician")).toBe(false);
  });

  it("empty inputs are never a match", () => {
    expect(isSafeLabelMatch("", "welder")).toBe(false);
    expect(isSafeLabelMatch("welder", "")).toBe(false);
  });

  it("it does NOT fold diacritics, on purpose", () => {
    // In a 28-language catalogue, folding here is how a wrong concept gets in.
    expect(isSafeLabelMatch("salis", "šalis")).toBe(false);
  });
});
