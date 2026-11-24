import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner decisions of 2026-11-24 (evening) for the public product and the
 * first onboarding step. Layout and wording only: no price, plan difference,
 * condition, right or function changes.
 */
const read = (p: string): string => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("owner 2026-11-24 — public pages", () => {
  it("the pricing questions are folds; every answer stays in the document", () => {
    const page = read("app/[locale]/(marketing)/pricing/page.tsx");
    expect(page).toContain('data-testid="pricing-faq"');
    expect(page).toMatch(/<details key=\{item\.q\} className="group">/);
    expect(page).toContain("{item.a}");
    // prices and plan differences stay on the page, unfolded
    expect(page).toContain("<PricingTable />");
    expect(page).toContain("<PrePaymentPlanBoundary />");
  });

  it("the recruitment service is named and marked as not a plan; its detail is one fold", () => {
    const offer = read("components/marketing/concierge-offer.tsx");
    expect(offer).toContain('data-testid="concierge-offer-fold"');
    const summary = offer.slice(offer.indexOf("<summary", offer.indexOf("concierge-offer-fold")), offer.indexOf("</summary>", offer.indexOf("concierge-offer-fold")));
    expect(summary).toContain('{t("title")}');
    expect(summary).toContain('{t("separate")}');
    expect(offer).toContain('{t("note")}');
    expect(offer).toContain("steps.map(");
  });

  it("the for-workers claim is one short sentence in every catalog", () => {
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const sub = (JSON.parse(read(`messages/${locale}.json`)) as { pages: { workers: { subcopy: string } } }).pages.workers.subcopy;
      expect(sub.length, locale).toBeGreaterThan(20);
      expect(sub.length, locale).toBeLessThanOrEqual(80);
      expect(sub.replace(/^\[EN\] /, "").split(/[.!?]\s/).length, locale).toBe(1);
    }
  });

  it("a public advert card has a named border colour (no bright default border in the dark theme)", () => {
    const card = read("components/marketing/public-vacancy-card.tsx");
    expect(card).not.toMatch(/\bborder (p-4|px-2)/);
    expect(card).toContain("border border-ink-600");
  });
});

describe("owner 2026-11-24 — onboarding step 1 is the choice", () => {
  const wizard = read("components/app/onboarding-wizard.tsx");
  it("no product paragraph and no description under an option", () => {
    expect(wizard).not.toContain('data-testid="onboarding-lead"');
    expect(wizard).not.toContain("rolePicker.intent.${intent}.desc");
  });
  it("the multi-choice line, the one instruction and the six titles stay", () => {
    expect(wizard).toContain('data-testid="onboarding-role-multi-note"');
    expect(wizard).toContain('data-testid="onboarding-continue-hint"');
    expect(wizard).toContain("rolePicker.intent.${intent}.title");
  });
});
