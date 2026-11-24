import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { readStatedLanguages } from "@/lib/conversation/language-statement";

/** "Kalbu angliškai ir rusiškai." scored 0 on production (2026-09-29). */
describe("languages said in words", () => {
  it("reads the languages, and a level only when said", () => {
    expect(readStatedLanguages("Kalbu angliškai ir rusiškai.")).toEqual([
      { lang: "en", level: null },
      { lang: "ru", level: null },
    ]);
    expect(readStatedLanguages("Moku anglų kalbą B2 lygiu, lietuvių – gimtoji.")).toEqual([
      { lang: "en", level: "B2" },
      { lang: "lt", level: "native" },
    ]);
    expect(readStatedLanguages("Išmokau skaityti techninius brėžinius.")).toEqual([]);
  });

  it("routes to language-statement; a sentence that also seeks keeps find-work", () => {
    expect(classifyIntent("Kalbu angliškai ir rusiškai.").intent).toBe("language-statement");
    expect(classifyIntent("I speak English and German").intent).toBe("language-statement");
    expect(classifyIntent("Ieškau darbo, kalbu angliškai").intent).not.toBe("language-statement");
  }, 20_000);
});
