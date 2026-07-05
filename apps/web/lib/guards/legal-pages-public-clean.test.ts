import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Public legal pages are clean and honest.
 *
 * History: audit P1 replaced draft-note placeholders with an honest "being
 * prepared" notice on terms/privacy/cookies. CR train WAGON 2 then upgraded
 * privacy + cookies (and added data-protection / data-access) to structured
 * plain-language explanations with a VISIBLE pending-legal-wording state —
 * terms stays the honest "being prepared" stub until the owner/lawyer text
 * arrives. No page may regress to a Placeholder or claim fake legal finality.
 * (The pack-level assertions live in compliance-explanation-pack.test.ts.)
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const LEGAL = "app/[locale]/(marketing)/legal";

describe("terms stays the honest 'being prepared' notice (owner/lawyer-gated)", () => {
  const src = read(`${LEGAL}/terms/page.tsx`);
  it("terms: no Placeholder import/render, no draftNote", () => {
    expect(src).not.toMatch(/import \{ Placeholder/);
    expect(src).not.toMatch(/<Placeholder/);
    expect(src).not.toMatch(/t\("draftNote"\)/);
  });
  it('terms: renders the honest "being prepared" notice', () => {
    expect(src).toMatch(/preparing\.body/);
    expect(src).toMatch(/data-testid="legal-terms"/);
  });
});

describe("privacy/cookies render structured honest content (WAGON 2 upgrade)", () => {
  const CASES: ReadonlyArray<[page: string, contentMarker: RegExp]> = [
    ["privacy", /privacy\.sections/],
    ["cookies", /cookies\.items/],
  ];
  for (const [p, marker] of CASES) {
    const src = read(`${LEGAL}/${p}/page.tsx`);
    it(`${p}: no Placeholder import/render, no draftNote`, () => {
      expect(src).not.toMatch(/import \{ Placeholder/);
      expect(src).not.toMatch(/<Placeholder/);
      expect(src).not.toMatch(/t\("draftNote"\)/);
    });
    it(`${p}: renders real structured i18n content with the pending-legal notice`, () => {
      expect(src).toMatch(marker);
      expect(src).toMatch(/PendingLegalNotice/);
      expect(src).toMatch(new RegExp(`data-testid="legal-${p}"`));
    });
  }
});

describe("marketplace rules still render real content", () => {
  it("renders the real rules list (not a placeholder) + the review note", () => {
    const src = read(`${LEGAL}/marketplace-rules/page.tsx`);
    expect(src).toMatch(/t\.raw\("rules"\)/);
    expect(src).not.toMatch(/<Placeholder/);
    expect(src).toMatch(/reviewNote/);
  });
});

describe("legal i18n: honest notices present (lt/en/ru), no draft wording shown", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    const legal = JSON.parse(read(`messages/${loc}.json`)).legal;
    it(`${loc}: legal.preparing.body + contact non-empty (terms still uses them)`, () => {
      expect(typeof legal?.preparing?.body === "string" && legal.preparing.body.length > 0).toBe(true);
      expect(typeof legal?.preparing?.contact === "string" && legal.preparing.contact.length > 0).toBe(true);
    });
    it(`${loc}: pending-legal + disclaimer wording non-empty`, () => {
      expect(typeof legal?.pendingLegal?.badge === "string" && legal.pendingLegal.badge.length > 0).toBe(true);
      expect(typeof legal?.pendingLegal?.body === "string" && legal.pendingLegal.body.length > 0).toBe(true);
      expect(typeof legal?.disclaimer === "string" && legal.disclaimer.length > 0).toBe(true);
    });
    it(`${loc}: unused legal.draftNote key is removed (no draft text in payload)`, () => {
      // Dead key — the legal pages no longer render it; removing it keeps the
      // internal "draft" wording out of the served next-intl payload too.
      expect(legal.draftNote).toBeUndefined();
    });
  }
});
