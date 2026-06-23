import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Public legal pages are clean (audit P1): no internal "draft note" wording and
 * no placeholder marker on terms/privacy/cookies; they show an honest "being
 * prepared" notice. Marketplace rules keep their real content. No fake legal
 * finality is claimed.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const LEGAL = "app/[locale]/(marketing)/legal";

describe("terms/privacy/cookies are clean public notices", () => {
  for (const p of ["terms", "privacy", "cookies"]) {
    const src = read(`${LEGAL}/${p}/page.tsx`);
    it(`${p}: no Placeholder import/render, no draftNote`, () => {
      expect(src).not.toMatch(/import \{ Placeholder/);
      expect(src).not.toMatch(/<Placeholder/);
      expect(src).not.toMatch(/t\("draftNote"\)/);
    });
    it(`${p}: renders the honest "being prepared" notice`, () => {
      expect(src).toMatch(/preparing\.body/);
      expect(src).toMatch(new RegExp(`data-testid="legal-${p}"`));
    });
  }
});

describe("marketplace rules still render real content", () => {
  it("renders the real rules list (not a placeholder)", () => {
    const src = read(`${LEGAL}/marketplace-rules/page.tsx`);
    expect(src).toMatch(/t\.raw\("rules"\)/);
    expect(src).not.toMatch(/<Placeholder/);
  });
});

describe("legal i18n: preparing notice present (lt/en/ru), no draft wording shown", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    const legal = JSON.parse(read(`messages/${loc}.json`)).legal;
    it(`${loc}: legal.preparing.body + contact non-empty`, () => {
      expect(typeof legal?.preparing?.body === "string" && legal.preparing.body.length > 0).toBe(true);
      expect(typeof legal?.preparing?.contact === "string" && legal.preparing.contact.length > 0).toBe(true);
    });
    it(`${loc}: unused legal.draftNote key is removed (no draft text in payload)`, () => {
      // Dead key — the legal pages no longer render it; removing it keeps the
      // internal "draft" wording out of the served next-intl payload too.
      expect(legal.draftNote).toBeUndefined();
    });
  }
});