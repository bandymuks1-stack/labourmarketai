import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: productized service offers ride the EXISTING cinematic baseline, and
 * their price CTAs stay honest.
 *
 * Two failure modes this guard locks out:
 *
 *  1. A future agent "rebuilds" the landing/marketing visual language into a new
 *     concept. The cinematic baseline (gradient-accent word, `card-border` /
 *     `wow-card` shells, live-dot eyebrow, the LiveMap / PlayerCardShowcase /
 *     DraftBoard / MarketPulse cluster) is the agreed look — it must be
 *     preserved, not re-invented.
 *
 *  2. The offer prices grow a fake commerce flow — Stripe, a checkout, an
 *     add-to-cart, a "buy now" — or claim self-serve payment the product does
 *     not have. Offers may only use the honest lead-capture CTA (WaitlistModal)
 *     and "from"/"nuo" indicative pricing.
 *
 * Runs in CI via `pnpm -F web test`. Complements the existing CTA-honesty and
 * pricing-honesty guards (which scan messages/*.json); this one pins the
 * COMPONENT layer + the cinematic baseline source.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP_ROOT, rel), "utf8");

describe("Guard: cinematic baseline is preserved (no visual rebuild)", () => {
  it("globals.css still defines the core cinematic utilities", () => {
    const css = read("app/globals.css");
    for (const cls of [
      ".text-gradient-accent",
      ".card-border",
      ".wow-card",
      ".live-dot",
    ]) {
      expect(css, `globals.css must keep ${cls}`).toContain(cls);
    }
  });

  it("the landing page still renders the cinematic baseline components", () => {
    const page = read("app/[locale]/(marketing)/page.tsx");
    for (const sym of [
      "PlayerCardShowcase",
      // Landing rebuild (owner directive 2026-07-29): the hero visual is the
      // LIVE PRODUCT DEMO — the same cinematic baseline, now showing the
      // product's real core loop instead of a static map (LiveProductDemo
      // superseded LiveWorldMap; enforced by lib/guards/global-landing.test.ts).
      // Owner shortening (visual acceptance §3.1, 2026-07-29): MarketPulse and
      // DraftBoard LEFT the landing — interior dashboards re-rendered as
      // brochure duplicated the product instead of showing it once.
      "LiveProductDemo",
      "text-gradient-accent",
    ]) {
      expect(page, `landing must keep the cinematic baseline marker ${sym}`).toContain(
        sym,
      );
    }
  });
});

describe("Guard: service offers integrate with the baseline and stay honest", () => {
  const offers = read("components/marketing/service-offers.tsx");

  it("offers reuse the existing cinematic card system (not a new design)", () => {
    expect(offers, "offers must use the shared card-border shell").toContain(
      "card-border",
    );
    expect(offers, "offers must use the shared gradient accent").toContain(
      "text-gradient-accent",
    );
  });

  it("offers use the honest lead CTA, never a checkout/payment flow", () => {
    expect(offers, "offers must reuse the WaitlistModal lead CTA").toContain(
      "WaitlistModal",
    );
    const FORBIDDEN: RegExp[] = [
      /stripe/i,
      /check\s?out/i,
      /add[\s-]?to[\s-]?cart/i,
      /paymentelement/i,
      /\/api\/(checkout|pay|payment)/i,
      /\bsubscribe\s*\(/i,
      /buy[\s-]?now/i,
    ];
    for (const rx of FORBIDDEN) {
      expect(
        rx.test(offers),
        `service-offers.tsx must not introduce a payment/checkout flow (${rx})`,
      ).toBe(false);
    }
  });

  it("offers are rendered on the pricing page", () => {
    const pricing = read("app/[locale]/(marketing)/pricing/page.tsx");
    expect(pricing).toContain("ServiceOffers");
  });
});

describe("Guard: offer copy shows honest 'from' prices in LT + EN", () => {
  for (const locale of ["lt", "en"] as const) {
    const msg = JSON.parse(read(`messages/${locale}.json`)) as {
      services?: {
        cta?: string;
        offers?: { name: string; priceFrom: string }[];
      };
    };
    const services = msg.services;

    it(`${locale}: has at least 5 productized offers`, () => {
      expect(Array.isArray(services?.offers)).toBe(true);
      expect(services!.offers!.length).toBeGreaterThanOrEqual(5);
    });

    it(`${locale}: every offer price is an honest "from"/"nuo" amount`, () => {
      for (const offer of services!.offers!) {
        expect(
          offer.priceFrom,
          `offer "${offer.name}" must show a "from"/"nuo" indicative price`,
        ).toMatch(/^(from|nuo)\b/i);
      }
    });

    it(`${locale}: CTA is a contact/proposal verb, not a purchase verb`, () => {
      expect(services!.cta ?? "").toMatch(
        /proposal|contact|discuss|talk|pasiūlym|susisiek|aptar|pakalb/i,
      );
    });
  }
});
