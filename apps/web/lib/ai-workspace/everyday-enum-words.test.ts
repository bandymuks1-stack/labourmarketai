import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { readWorldState, type VocabularyTerm } from "./world-state-language";

/**
 * A REFINEMENT MUST BE READ IN THE WORDS PEOPLE USE (owner P0 2026-09-22 §5).
 *
 * Measured before this slice: the accommodation vocabulary was built only
 * from the enum LABELS ("Suteikiamas, nemokamai"), so the owner's own
 * follow-up sentence — "Tik su būstu." — read as nothing and the board was
 * silently not narrowed. `vocabulary-server.ts` even used that sentence as
 * its docstring example. The fix is the file's own `EVERYDAY_TYPE_WORDS`
 * idiom, extended to the enum dimensions.
 *
 * The vocabulary itself is server-built (i18n + the person's own facets), so
 * this test exercises the pure reader with the terms that server now emits,
 * and pins the source list so the words cannot quietly disappear.
 */
const SRC = readFileSync(join(__dirname, "vocabulary-server.ts"), "utf8");

const accommodation = (value: string, terms: string[]): VocabularyTerm => ({
  dimension: "accommodation",
  value,
  terms,
  available: true,
});

describe("the housing refinement is understood in the words people type", () => {
  const vocab = [
    accommodation("provided_free", [
      "Suteikiamas, nemokamai",
      "su būstu",
      "apgyvendinimu",
      "with housing",
      "housing",
      "с жильем",
      "met huisvesting",
      "mit unterkunft",
      "z zakwaterowaniem",
    ]),
    accommodation("not_provided", ["Nesuteikiamas", "be būsto", "without housing"]),
  ];

  it.each([
    ["Tik su būstu.", "provided_free"],
    ["tik su apgyvendinimu", "provided_free"],
    ["only with housing", "provided_free"],
    ["Только с жильем", "provided_free"],
    ["Alleen met huisvesting", "provided_free"],
    ["Nur mit Unterkunft", "provided_free"],
    ["Tylko z zakwaterowaniem", "provided_free"],
    // The negative must NOT narrow to "with" — a person excluding housing is
    // not a person asking for it.
    ["Be būsto", "not_provided"],
  ])("%s → accommodation = %s", (sentence, value) => {
    const match = readWorldState(sentence, vocab).matches.find(
      (m) => m.dimension === "accommodation",
    );
    expect(match?.value, sentence).toBe(value);
  });

  it("NEGATIVE CONTROL — the enum labels alone could not read any of them", () => {
    const labelsOnly = [accommodation("provided_free", ["Suteikiamas, nemokamai"])];
    expect(readWorldState("Tik su būstu.", labelsOnly).matches).toEqual([]);
  });

  it("the everyday words live beside the catalogue labels, never instead of them", () => {
    expect(SRC).toMatch(/const EVERYDAY_ENUM_WORDS/);
    // The labels are still collected first, so the DISPLAY name of a value
    // stays the catalogue's word in the reader's language.
    expect(SRC).toMatch(/if \(t\.has\(value\)\) names\.add\(t\(value\) as string\);[\s\S]{0,700}EVERYDAY_ENUM_WORDS/);
    // Only accommodation is extended today; a new dimension is a deliberate
    // edit, not a silent widening.
    const block = SRC.slice(SRC.indexOf("const EVERYDAY_ENUM_WORDS"), SRC.indexOf("/** Enum dimensions"));
    expect(block.match(/^  [a-zA-Z]+: \{$/gm)).toEqual(["  accommodation: {"]);
  });
});
