import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activeLocales } from "@/lib/i18n/config";

/**
 * /pricing PROMISES NO PAYMENT PRODUCTION DOES NOT TAKE (owner P0 2026-11-10).
 *
 * With online payment closed to the public, the page said both "nothing can be
 * bought" and, on the plan card and in the FAQ, "Activation happens in your
 * organization account" / "Card payment through Stripe. Invoices … live in
 * your organization account". While activation is closed the card and the
 * billing answer now use their own closed-state sentences; free registration
 * and the free active position are still stated.
 */
const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const table = read("components/marketing/pricing-table.tsx");
const page = read("app/[locale]/(marketing)/pricing/page.tsx");

describe("closed online payment is said as closed", () => {
  it("the plan card uses the closed sentence when billing is not armed", () => {
    expect(table).toMatch(/confirmed && !billingOn\s*\?\s*t\("priceState\.owner_confirmed_closed"\)/);
  });

  it("the billing FAQ answer is replaced while activation is closed", () => {
    expect(page).toContain("const BILLING_FAQ_INDEX = 2;");
    expect(page).toMatch(/i === BILLING_FAQ_INDEX && !activationOpen \? \{ q: item\.q, a: t\("faqBillingClosed"\) \}/);
  });

  for (const locale of activeLocales) {
    it(`${locale}: the closed sentences promise no payment and keep the free tier`, () => {
      const p = JSON.parse(read(`messages/${locale}.json`)).pricing;
      const closed = `${p.priceState.owner_confirmed_closed} ${p.faqBillingClosed}`;
      expect(closed).not.toMatch(/Stripe/);
      // The FAQ entry the index points at is the billing question in every language.
      expect(p.faq[2].a, `${locale} faq[2]`).toMatch(/Stripe/);
      // Registration and one active position stay free, in every language.
      expect(p.faqBillingClosed).toMatch(/1|one|eine|één|jedno|одна|viena/i);
    });
  }
});
