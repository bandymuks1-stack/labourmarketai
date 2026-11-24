import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Landing positioning guard (visible-copy-audit-rewrite-v1).
 *
 * Labourmarket.ai is a general labour-market platform covering LOCAL,
 * regional AND international work — not "work abroad" as its essence. The
 * public hero must not lead with a work-abroad-only message and must carry the
 * balanced local + international framing. Working abroad stays ONE option.
 */

const ROOT = join(__dirname, "..", "..");
const msg = (loc: string) =>
  JSON.parse(readFileSync(join(ROOT, "messages", `${loc}.json`), "utf8"));

// Patterns that would mean the landing LEADS with "work abroad".
const ABROAD_LEAD: Record<string, RegExp> = {
  lt: /^darbas užsienyje/i,
  en: /^work abroad/i,
  ru: /^работа за границей/i,
};

// Balanced local+international framing tokens the hero must carry.
const BALANCED: Record<string, RegExp> = {
  lt: /vietin|tarptautin/i,
  en: /local|international/i,
  ru: /местн|международн/i,
};

describe("public landing is not framed as work-abroad-only", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: hero headline does not lead with "work abroad"`, () => {
      expect(msg(loc).hero.headline).not.toMatch(ABROAD_LEAD[loc]);
    });
    it(`${loc}: hero carries balanced local + international framing`, () => {
      const h = msg(loc).hero;
      const text = `${h.headline} ${h.headlineAccent} ${h.subcopy}`;
      expect(text).toMatch(BALANCED[loc]);
    });
    it(`${loc}: hero subcopy mentions companies AND people (not one audience only)`, () => {
      const sub = msg(loc).hero.subcopy.toLowerCase();
      const people = /žmon|people|люди|darbuotoj|worker|работник/.test(sub);
      const company = /įmon|compan|компани|darbdav|employer|работодат/.test(sub);
      expect(people && company, `${loc} both audiences`).toBe(true);
    });
  }

  it("the brand SEO description carries local + international framing (EN)", () => {
    const seo = readFileSync(join(ROOT, "lib/seo/metadata.ts"), "utf8");
    expect(seo).toMatch(/locally and internationally/i);
  });
});
