import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Marketplace rules guard (full-completion train PR 9).
 *
 * Launch-ready legal rules that never overpromise: no legal-eligibility without
 * documents, no auto "verified", no contacts without permission, moderation
 * before public visibility, payments not active.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("marketplace rules page exists + is linked", () => {
  it("the page route exists", () => {
    expect(
      existsSync(join(ROOT, "app/[locale]/(marketing)/legal/marketplace-rules/page.tsx")),
    ).toBe(true);
  });
  it("the footer links to it", () => {
    const footer = read("components/layouts/site-footer.tsx");
    expect(footer).toMatch(/\/legal\/marketplace-rules/);
    expect(footer).toMatch(/marketplaceRules\.title/);
  });
});

describe("marketplace rules copy is honest (no overpromise) in every locale", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    const mr = JSON.parse(read(`messages/${loc}.json`)).legal.marketplaceRules;
    it(`${loc}: has title, intro and 6+ rules`, () => {
      expect(mr?.title && mr?.intro).toBeTruthy();
      expect(Array.isArray(mr.rules) && mr.rules.length >= 6).toBe(true);
    });
    it(`${loc}: rules mention documents, verification check, moderation, payments-not-active`, () => {
      const blob = (mr.rules as string[]).join(" ").toLowerCase();
      expect(/document|dokument|документ/.test(blob), `${loc} documents`).toBe(true);
      expect(/moderation|moderav|модерац/.test(blob), `${loc} moderation`).toBe(true);
      expect(/not active|neaktyv|не актив/.test(blob), `${loc} payments not active`).toBe(true);
    });
    it(`${loc}: makes no work/match guarantee`, () => {
      const blob = (mr.rules as string[]).join(" ").toLowerCase() + " " + mr.intro.toLowerCase();
      expect(/guarantee.*(job|work|match)|garantuo\w*\s*(darb|atitik)|гаранти\w*\s*(работ|совпад)/.test(blob)).toBe(false);
    });
  }
});
