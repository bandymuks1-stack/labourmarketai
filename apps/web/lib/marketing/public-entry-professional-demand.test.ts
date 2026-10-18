import { describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

import { readPublicEntry } from "./public-entry";

/**
 * Lane F probe (production ca96605b, 2026-09-06): sixty landing sentences
 * through `readPublicEntry`. Professional employer demand was `unknown` in
 * EVERY locale, and RU "Ищу сантехника" landed on the person's own job
 * search. The landing composes the ONE router (`classifyIntent`) — it has no
 * pattern set of its own — so the fix lives in the router's shared sources
 * and this file only pins the public reading.
 */
describe("public entry — professional employer demand is recognised as HIRE", () => {
  it.each([
    "Reikia buhalterio Vilniuje",
    "Reikia 2 buhalterių Vilniuje",
    "Ieškome programuotojo į komandą",
    "I need an accountant in Vilnius",
    "We need a developer for our team",
    "Нужен программист",
    "Wir brauchen 2 Buchhalter",
    "wij zoeken een boekhouder",
  ])("%s", (sentence) => {
    expect(readPublicEntry(sentence)).toMatchObject({
      kind: "recognised",
      intent: "need-workers",
      family: "hire",
    });
  });

  it("RU 'Ищу сантехника' is the buyer's side (hire family), not find-work", () => {
    const r = readPublicEntry("Ищу сантехника");
    expect(r.kind).toBe("recognised");
    if (r.kind === "recognised") {
      expect(r.intent).not.toBe("find-work");
      expect(r.family).toBe("hire");
    }
  });

  it("the person's own search keeps the WORK family", () => {
    expect(readPublicEntry("ieškau darbo Norvegijoje")).toMatchObject({ intent: "find-work", family: "work" });
    expect(readPublicEntry("Ich suche Arbeit in Deutschland")).toMatchObject({ intent: "find-work", family: "work" });
  });

  it("the public entry still has no vocabulary of its own", () => {
    // If somebody adds a pattern table here, the router and the landing drift.
    // Pinned by reading the module source: one import of `classifyIntent`,
    // no RegExp literal.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "public-entry.ts"), "utf8") as string;
    expect(src).toContain('import { classifyIntent } from "@/lib/conversation/intent-router";');
    expect(src).not.toMatch(/new RegExp\(|\/\^?\[\^\\s\]|patterns\s*[:=]/);
  });
});
