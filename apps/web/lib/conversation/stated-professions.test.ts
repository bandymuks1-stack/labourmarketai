import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { readCompoundStatement } from "@/lib/conversation/compound-statement";
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


describe("two professions are not a compound of profession + skill", () => {
  it("'Esu pastolininkas ir stogdengys' reaches the profession review", () => {
    const c = readCompoundStatement("Esu pastolininkas ir stogdengys.");
    expect(c.facts.some((f) => f.kind === "skill")).toBe(false);
    expect(c.isCompound).toBe(false);
  });
});

describe("a word naming the document is not a skill", () => {
  it("'Turiu B kategorijos vairuotojo pažymėjimą' is one credential, no skill", () => {
    const c = readCompoundStatement("Turiu B kategorijos vairuotojo pažymėjimą.");
    expect(c.facts.map((f) => f.kind)).toEqual(["credential"]);
    expect(c.isCompound).toBe(false);
  });
});


describe("a stated driving licence reaches the add-document door", () => {
  it("routes with the category between 'turiu' and the document noun", () => {
    expect(classifyIntent("Turiu B kategorijos vairuotojo pažymėjimą.").intent).toBe("add-document");
  }, 20_000);
});
