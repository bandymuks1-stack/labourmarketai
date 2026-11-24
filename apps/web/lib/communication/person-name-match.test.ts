import { describe, expect, it } from "vitest";

import { foldName, matchPeopleByName, tokensMatch } from "./person-name-match";

const people = [
  { name: "Jonas Jonaitis", item: "jonas" },
  { name: "Petras Petraitis", item: "petras" },
  { name: "Jonė Kazlauskaitė", item: "jone" },
  { name: "Ąžuolas Šimkus", item: "azuolas" },
];

describe("person name matching", () => {
  it("folds diacritics and case", () => {
    expect(foldName("Ąžuolas  ŠIMKUS")).toBe("azuolas simkus");
  });

  it("meets an inflected reference with the nominative name", () => {
    // "Jonui" is honestly ambiguous between Jonas and Jonė - never one guessed.
    expect(matchPeopleByName("parašyk Jonui", people)).toEqual(["jonas", "jone"]);
    expect(matchPeopleByName("parašyk Jonui Jonaitį", people)).toEqual(["jonas"]);
    expect(matchPeopleByName("atidaryk pokalbį su Petru", people)).toEqual(["petras"]);
    expect(matchPeopleByName("Ąžuolu", people)).toEqual(["azuolas"]);
  });

  it("a surname narrows a first name", () => {
    expect(matchPeopleByName("Jonas Jonaitis", people)).toEqual(["jonas"]);
  });

  it("never matches everyone from stop-words, and never matches across people", () => {
    expect(matchPeopleByName("pokalbis su", people)).toEqual([]);
    expect(matchPeopleByName("Mantas", people)).toEqual([]);
  });

  it("token rule: shared prefix must cover all but a case ending", () => {
    expect(tokensMatch("jonui", "jonas")).toBe(true);
    expect(tokensMatch("jo", "jonas")).toBe(false);
    expect(tokensMatch("jonas", "jonaitis")).toBe(false);
  });
});
