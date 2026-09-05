import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Owner directive 2026-09-05 (Gemini runtime check, item 8): the public
 * landing "must never pretend a canned scenario is the user's answer".
 *
 * The hero runs NO model (`data-egress.ts` keeps free text from leaving the
 * platform; the conversation router is deterministic). It routes a visitor's
 * own question to one of three scripted scenarios by topic. That is honest
 * only when (a) the section is labelled an EXAMPLE, not an AI answer, and
 * (b) a visitor's own question shows the "this is an example on your topic"
 * line before any reasoning is read as theirs. This guard pins both.
 */
const APP = join(__dirname, "..", "..");
const HERO = readFileSync(join(APP, "components", "marketing", "hero-live-demo.tsx"), "utf8");

function landingLocales(): Array<[string, Record<string, string>]> {
  const dir = join(APP, "messages");
  const out: Array<[string, Record<string, string>]> = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const json = JSON.parse(readFileSync(join(dir, f), "utf8")) as { landing?: { hero?: Record<string, string> } };
    const hero = json.landing?.hero;
    if (hero && "decisionLabel" in hero) out.push([f.replace(/\.json$/, ""), hero]);
  }
  return out;
}

describe("the landing hero never presents a scripted scenario as the visitor's answer", () => {
  it("a visitor's own question is flagged as an example before the reasoning renders", () => {
    expect(HERO).toContain("setAskedOwn(asked !== undefined)");
    expect(HERO).toContain('data-testid="hero-own-question-note"');
    expect(HERO).toContain('{t("ownQuestionNote")}');
    // the note precedes the reasoning list in the render tree
    expect(HERO.indexOf('data-testid="hero-own-question-note"')).toBeLessThan(HERO.indexOf('data-testid="hero-reasoning"'));
    // the unmatched path still says so instead of answering
    expect(HERO).toContain('data-testid="hero-unmatched"');
  });

  it("every landing locale labels the section an example, never an AI answer, and carries the own-question note", () => {
    const locales = landingLocales();
    expect(locales.length).toBeGreaterThanOrEqual(5);
    const CLAIMS_A_MODEL = /^(AI|KI|ИИ)\b|^AI-|^KI-/;
    for (const [loc, hero] of locales) {
      expect(hero.chatLabel, `${loc}.chatLabel`).not.toMatch(CLAIMS_A_MODEL);
      expect(hero.decisionLabel, `${loc}.decisionLabel`).not.toMatch(CLAIMS_A_MODEL);
      expect(typeof hero.ownQuestionNote, `${loc}.ownQuestionNote`).toBe("string");
      expect(hero.ownQuestionNote.length, `${loc}.ownQuestionNote`).toBeGreaterThan(30);
    }
  });
});
