import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { readSkillStatement } from "@/lib/conversation/skill-statement";

/** "Išmokau skaityti techninius brėžinius." scored 0 on production (2026-09-29). */
describe("a skill said in words", () => {
  it("keeps the person's own words and sees the catalogue skill in them", () => {
    expect(readSkillStatement("Išmokau skaityti techninius brėžinius.")).toEqual({
      phrase: "skaityti techninius brėžinius",
      slugs: ["blueprint-reading"],
    });
    expect(readSkillStatement("Esu pastolininkas.")).toBeNull();
  });

  it("routes skills, while languages, availability and searches keep their doors", () => {
    expect(classifyIntent("Išmokau skaityti techninius brėžinius.").intent).toBe("skill-statement");
    expect(classifyIntent("Moku anglų kalbą B2 lygiu.").intent).toBe("language-statement");
    expect(classifyIntent("Galiu pradėti dirbti nuo spalio 15 d.").intent).toBe("availability");
    expect(classifyIntent("Ieškau darbo, moku mūryti").intent).not.toBe("skill-statement");
  }, 20_000);
});
