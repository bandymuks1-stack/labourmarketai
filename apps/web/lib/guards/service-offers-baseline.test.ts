import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { landingTreeSource } from "./landing-composition";

/**
 * Guard: productized service offers coexist with the owner-approved V1
 * cinematic baseline, and their price CTAs stay honest.
 *
 * Two failure modes this guard locks out:
 *
 *  1. A future agent replaces the approved living-market command surface.
 *     V1's responsive cinematic world, conceptual sector activity and complete
 *     Work → Evidence → Opportunity event are the agreed baseline.
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
    // The canonical page delegates through the V1 server assembler; depth 2
    // reaches the command surface without turning this into a whole-repo grep.
    const page = landingTreeSource(APP_ROOT, 2);
    for (const sym of [
      "LiveMarketCommand",
      "world-desktop.webp",
      'data-layer="conceptual-sector-activity"',
      "styles.entryBand",
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

  // M7 (beta foundation audit 2026-08-08) INVERTED this assertion. It used to
  // require `ServiceOffers` on /pricing. That is exactly the defect: the beta
  // labour-market pricing page must not also sell AI-automation agency work at
  // €900–€1,900 while its own tiers say pricing is still being prepared. The
  // component and its copy stay intact and guarded above — only the HOST is
  // gone, and where the offers belong next is an owner decision.
  it("offers are NOT rendered on the beta labour-market pricing page", () => {
    const pricing = read("app/[locale]/(marketing)/pricing/page.tsx");
    // Import-based, so the explanatory comment naming <ServiceOffers /> stays
    // legal: a component that is never imported cannot render.
    expect(
      /^\s*import[^;]*service-offers/m.test(pricing),
      "/pricing must not import service-offers (M7)",
    ).toBe(false);
    expect(
      /<ServiceOffers\s*\/?>/.test(pricing.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")),
      "/pricing must not render <ServiceOffers /> (M7)",
    ).toBe(false);
  });

  it("the component and its copy survive for a future owner-chosen host", () => {
    expect(offers).toContain("export async function ServiceOffers");
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
