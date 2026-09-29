import { describe, expect, it } from "vitest";

import { readStatedProfessions } from "@/lib/conversation/stated-professions";

/** 0/1/N professions stated in one message (owner continuation 2026-09-29). */
describe("readStatedProfessions", () => {
  it("reads one, several, and none", () => {
    expect(readStatedProfessions("Esu pastolininkas.").map((r) => r.label)).toEqual(["Pastolininkas"]);
    expect(readStatedProfessions("Esu pastolininkas ir stogdengys.").map((r) => [r.label, r.professionSlug])).toEqual([
      ["Pastolininkas", null],
      ["Stogdengys", "roofer"],
    ]);
    expect(readStatedProfessions("Dar dirbu ir stogdengiu.").map((r) => r.professionSlug)).toEqual(["roofer"]);
    expect(readStatedProfessions("Ieškau darbo")).toEqual([]);
    expect(readStatedProfessions("Esu Jonas")).toEqual([]);
  });
});
