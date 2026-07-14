/**
 * Guard — PRICING CATALOGUE V2 HONESTY (Sprint v2 §9).
 *
 * The public pricing page now shows OWNER-CONFIRMED prices, but payments
 * remain OFF. This guard pins:
 *   1. the page renders the V2 catalogue and keeps the honest surfaces
 *      (concierge, plan boundary) — no technical billing UI leaks;
 *   2. the catalogue component carries the "payments in preparation" state,
 *      derives prices from the typed catalogue (never free-text), and has NO
 *      checkout affordance — its only CTA is the real waitlist flow;
 *   3. pricingV2 copy exists in ALL 5 active locales with no fake-activation
 *      language (no "buy/pay/subscribe/checkout now", no live-payment claim,
 *      no provider/technical vocabulary, no forbidden pilot framing);
 *   4. pricingV2 i18n plans/ad items are SET-EQUAL to the code registries —
 *      no phantom plan or ad product can be claimed via copy;
 *   5. the Launch Offer copy states the real window (2026-10-31) and the
 *      15% / 2027-01-01 first-annual rule via placeholders bound to
 *      lib/billing/offers.ts constants.
 *
 * This guard is STRENGTHENED, never disabled.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PLAN_CATALOGUE_V2 } from "../billing/plans";
import { AD_PRODUCT_SLUGS } from "../billing/ad-products";
import {
  LAUNCH_OFFER_VALID_UNTIL_ISO,
  FIRST_ANNUAL_DISCOUNT_DEADLINE_ISO,
} from "../billing/offers";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

const PAGE = "app/[locale]/(marketing)/pricing/page.tsx";
const COMPONENT = "components/marketing/pricing-catalogue-v2.tsx";

const flatten = (o: unknown, out: string[] = []): string[] => {
  if (typeof o === "string") out.push(o);
  else if (Array.isArray(o)) for (const v of o) flatten(v, out);
  else if (o && typeof o === "object")
    for (const v of Object.values(o as Record<string, unknown>)) flatten(v, out);
  return out;
};

// Fake-activation / live-claim vocabulary — none may appear in pricingV2 copy.
const BANNED_COPY = [
  /\bbuy\s+now\b/i,
  /\bpay\s+now\b/i,
  /\bcheckout\s+now\b/i,
  /\bsubscribe\s+now\b/i,
  /\bsubscription\s+active\b/i,
  /\bpayment\s+active\b/i,
  /\bcheckout\s+active\b/i,
  /\bpayments?\s+(?:are|is)\s+live\b/i,
  /\bautomatic\s+billing\b/i,
  // technical/provider vocabulary stays out of customer copy
  /stripe/i,
  /price_/,
  /PAYMENTS_ENABLED/,
  // §18 Realumo — removed pilot/demo wrapper framing
  /bandomoji prieiga/i,
  /pilotinis režimas/i,
  /Tier-2/i,
  /Užsakyti pilotą/i,
];

describe("pricing page wiring (V2 catalogue, honest surfaces intact)", () => {
  const page = read(PAGE);

  it("renders the V2 catalogue instead of the legacy placeholder table", () => {
    expect(page).toMatch(/PricingCatalogueV2/);
    expect(page).not.toMatch(/<PricingTable\b/);
  });

  it("keeps the honest public surfaces (concierge + plan boundary)", () => {
    expect(page).toMatch(/ConciergeAccessBanner/);
    expect(page).toMatch(/ConciergeOfferSection/);
    expect(page).toMatch(/PrePaymentPlanBoundary/);
  });
});

describe("catalogue component honesty", () => {
  const src = read(COMPONENT);

  it("shows the payments-in-preparation state prominently", () => {
    expect(src).toMatch(/data-testid="pricing-v2-payments-state"/);
    expect(src).toMatch(/paymentsState\.badge/);
    expect(src).toMatch(/paymentsState\.body/);
  });

  it("prices come from the typed catalogue, never free-text i18n", () => {
    expect(src).toMatch(/PLAN_CATALOGUE_V2/);
    expect(src).toMatch(/formatEurMonthlyCents\(plan\.priceMonthlyCents\)/);
  });

  it("has NO checkout affordance — the only CTA is the real waitlist flow", () => {
    expect(src).toMatch(/WaitlistModal/);
    expect(src).not.toMatch(/test-checkout/i);
    expect(src).not.toMatch(/BillingTestCheckout/);
    expect(src).not.toMatch(/api\/billing/);
    expect(src).not.toMatch(/<form/i);
    expect(src).not.toMatch(/checkout/i);
  });

  it("Launch Offer card binds the REAL window constants from offers.ts", () => {
    expect(src).toMatch(/LAUNCH_OFFER_VALID_UNTIL_ISO/);
    expect(src).toMatch(/FIRST_ANNUAL_DISCOUNT_DEADLINE_ISO/);
    expect(src).toMatch(/FIRST_ANNUAL_DISCOUNT_PERCENT/);
    // and the constants themselves are the owner dates
    expect(LAUNCH_OFFER_VALID_UNTIL_ISO).toBe("2026-10-31");
    expect(FIRST_ANNUAL_DISCOUNT_DEADLINE_ISO).toBe("2027-01-01");
  });

  it("ad products render ONLY the inactive 'in preparation' list", () => {
    expect(src).toMatch(/inactiveAdProducts/);
    expect(src).toMatch(/data-testid="pricing-v2-ad-products-preparing"/);
    expect(src).toMatch(/adProducts\.preparing/);
  });
});

describe("pricingV2 copy in all 5 active locales", () => {
  const planSlugs = PLAN_CATALOGUE_V2.map((p) => p.slug).sort();
  const adSlugs = [...AD_PRODUCT_SLUGS].sort();

  for (const loc of ACTIVE_LOCALES) {
    it(`${loc}: namespace complete, registry-set-equal, no fake-activation language`, () => {
      const m = JSON.parse(read(`messages/${loc}.json`));
      const p = m.pricingV2;
      expect(p, `${loc}: pricingV2 missing`).toBeTruthy();

      // structural keys
      expect(typeof p.paymentsState?.badge).toBe("string");
      expect(typeof p.paymentsState?.body).toBe("string");
      for (const a of ["person", "company", "agency"]) {
        expect(typeof p.audiences?.[a], `${loc}: audiences.${a}`).toBe("string");
      }
      for (const k of ["free", "perMonth", "cta", "ctaNote", "ctaFree"]) {
        expect(typeof p[k], `${loc}: ${k}`).toBe("string");
      }

      // plans set-equal to the code catalogue (no phantom plan copy)
      expect(Object.keys(p.plans ?? {}).sort(), `${loc}: plans keys`).toEqual(
        planSlugs,
      );
      for (const slug of planSlugs) {
        expect(typeof p.plans[slug].name, `${loc}: ${slug}.name`).toBe("string");
        expect(typeof p.plans[slug].tagline, `${loc}: ${slug}.tagline`).toBe(
          "string",
        );
        expect(
          Array.isArray(p.plans[slug].features) &&
            p.plans[slug].features.length > 0,
          `${loc}: ${slug}.features`,
        ).toBe(true);
      }

      // ad product labels set-equal to the code registry
      expect(
        Object.keys(p.adProducts?.items ?? {}).sort(),
        `${loc}: adProducts.items`,
      ).toEqual(adSlugs);
      for (const k of ["badge", "title", "note", "preparing"]) {
        expect(typeof p.adProducts?.[k], `${loc}: adProducts.${k}`).toBe(
          "string",
        );
      }

      // launch offer copy carries the placeholders (values come from code)
      expect(p.launchOffer?.validUntil).toContain("{date}");
      expect(p.launchOffer?.discountNote).toContain("{percent}");
      expect(p.launchOffer?.discountNote).toContain("{annualBy}");

      // no fake-activation / live-payment / provider vocabulary anywhere
      for (const s of flatten(p)) {
        for (const rx of BANNED_COPY) {
          expect(rx.test(s), `${loc}: banned copy ${rx} in "${s}"`).toBe(false);
        }
      }

      // admin catalogue/eligibility copy exists too (same 5 locales)
      expect(typeof m.adminBilling?.catalogueV2?.title).toBe("string");
      expect(typeof m.adminBilling?.offerEligibility?.unavailable).toBe(
        "string",
      );
    });
  }
});
