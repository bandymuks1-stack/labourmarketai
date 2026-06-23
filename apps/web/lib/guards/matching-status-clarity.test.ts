import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Matching status clarity (audit P1): the scouting surface honestly states what
 * works today (signals/readiness/possible fit) and that an active candidate
 * stream still depends on real filled profiles + needs — never "guaranteed",
 * "instant", or "AI matching". CTAs lead to real actions (fill need, etc.).
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const page = read("app/[locale]/dashboard/company/scouting/page.tsx");

describe("scouting renders an honest matching status note", () => {
  it("renders the status note block + disclaimer", () => {
    expect(page).toMatch(/data-testid="scouting-status-note"/);
    expect(page).toMatch(/statusNote\.disclaimer/);
    expect(page).toMatch(/statusNote\.signals/);
    expect(page).toMatch(/statusNote\.fill/);
  });
});

describe("matching copy is honest (lt/en/ru), no over-claim", () => {
  // A positive guarantee / instant / AI-matching claim must NOT appear in the
  // scouting copy. (An honest negation like "not guaranteed" is allowed and is
  // checked separately as the disclaimer.)
  const BAD: RegExp[] = [
    /garantuojame\s+(?:atitik|darb|įdarbin)/i,
    /we guarantee (?:a )?(?:match|job|placement)/i,
    /\binstant match(?:es|ing)?\b/i,
    /\bAI matching\b/i,
    /akimirksniu\b/i,
    /гарантируем\s+(?:соответств|трудоустрой)/i,
  ];
  for (const loc of ["lt", "en", "ru"] as const) {
    const scouting = JSON.parse(read(`messages/${loc}.json`)).scouting;
    it(`${loc}: statusNote has all 5 keys, non-empty`, () => {
      for (const k of ["title", "signals", "stream", "fill", "disclaimer"]) {
        expect(typeof scouting?.statusNote?.[k] === "string" && scouting.statusNote[k].length > 0, `${loc} ${k}`).toBe(true);
      }
    });
    it(`${loc}: no fake guaranteed/instant/AI-matching claim in scouting copy`, () => {
      const all = JSON.stringify(scouting);
      for (const re of BAD) expect(re.test(all), `${loc} matched ${re}`).toBe(false);
    });
  }
});