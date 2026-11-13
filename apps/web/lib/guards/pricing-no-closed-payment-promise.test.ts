import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activeLocales } from "@/lib/i18n/config";

/**
 * PUBLIC PAGES PROMISE ONLY WHAT WORKS (owner P0 2026-11-10; owner approval
 * 2026-11-12 (b)).
 *
 * 1. With online payment closed to the public, /pricing said both "nothing
 *    can be bought" and, on the plan card and in the FAQ, "Activation happens
 *    in your organization account" / "Card payment through Stripe. Invoices …
 *    live in your organization account".
 * 2. The free card and three FAQ answers stated "1 active position free",
 *    but that limit is enforced only for an organization whose billing is
 *    armed (lib/billing/open-needs-gate.ts is permissive otherwise). The
 *    companies/agencies FAQs, the concierge note and the plan boundary said
 *    the same.
 *
 * While activation is closed the card, the free features and EVERY FAQ answer
 * use their closed-state sentences; the always-rendered pages carry no limit
 * and no payment claim at all. The live wording returns by itself once
 * activation opens.
 */
const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const table = read("components/marketing/pricing-table.tsx");
const page = read("app/[locale]/(marketing)/pricing/page.tsx");

/** A stated active-position count ("1 active position", "one …", "viena …"). */
const POSITION_COUNT =
  /\b(1|one|eine|één|jedno|одна|viena)\s+(aktyvi|active|aktive|actieve|aktywne|активная)/i;

describe("closed online payment is said as closed", () => {
  it("the plan card uses the closed sentence when billing is not armed", () => {
    expect(table).toMatch(/confirmed && !billingOn\s*\?\s*t\("priceState\.owner_confirmed_closed"\)/);
  });

  it("the free card lists its closed-state features while activation is closed", () => {
    expect(table).toMatch(/!\(billingOn && confirmed\) && t\.has\(closedKey as never\)/);
    expect(table).toContain("`plans.${slug}.featuresClosed`");
  });

  it("every FAQ answer is replaced by its closed-state answer while activation is closed", () => {
    expect(page).toMatch(/const faqClosed = t\.raw\("faqClosed"\) as string\[\];/);
    expect(page).toMatch(/activationOpen \? item : \{ q: item\.q, a: faqClosed\[i\] \?\? item\.a \}/);
    // JSON-LD is built from the same list visitors read.
    expect(page).toContain("faqPageJsonLd(faq, locale)");
  });

  it("the public claims registry no longer serves the free-position claim as LIVE", () => {
    // AGENTS.md § Public claims registry: when the page stops saying a claim,
    // it is RETIRED (listed, no pages), so outreach stops citing it.
    const registry = read("lib/public-claims/registry.ts");
    const entry = registry.slice(registry.indexOf('claimId: "employer.one-position-free"'));
    expect(entry.slice(0, entry.indexOf("},"))).toMatch(/status: "RETIRED"[\s\S]*pages: \[\]/);
  });

  it("the public pricing copy carries no internal wording (owner P0 2026-11-13)", () => {
    const m = JSON.parse(read("messages/en.json"));
    const b = m.planBoundary;
    // What a visitor can be shown while payment is closed (the admin plan and
    // the draft-pricing sentence are never rendered publicly).
    const shown = [
      b.title, b.subcopy, b.note, b.featuresLabel, b.readiness.owner_confirmed,
      b.plans.free_worker, b.plans.worker_plus, b.plans.company_pilot, b.plans.agency_pilot, b.plans.free_organization,
      b.access.free, b.access.payment_not_enabled, ...Object.values(b.cta), ...Object.values(b.freeToday),
      b.enforcement.free_surface, b.enforcement.server_gate, b.enforcement.declared_boundary_only,
      m.pricing.priceState.owner_confirmed_closed, m.pricing.subcopyConfirmed,
      ...m.conciergeOffer.steps.map((x: { body: string }) => x.body),
    ].join(" | ");
    for (const jargon of [/boundary/i, /starts only with billing/i, /prepared/i, /\bpilot\b/i, /by the owner/i, /\bcrews?\b/i]) {
      expect(shown, String(jargon)).not.toMatch(jargon);
    }
  });

  it("the recruitment service is a separate, labelled block below the platform plans (owner correction 2026-11-13)", () => {
    // A recruitment success fee is the service's, never a platform fee: the
    // block renders AFTER the plans and says in words that it is not a plan.
    expect(page.indexOf("<ConciergeOfferSection />")).toBeGreaterThan(page.indexOf("<PricingTable />"));
    expect(read("components/marketing/concierge-offer.tsx")).toContain('{t("separate")}');
    for (const locale of activeLocales) {
      const c = JSON.parse(read(`messages/${locale}.json`)).conciergeOffer;
      expect(c.title, `${locale}: names the provider`).toContain("Nonstop Group");
      expect(c.separate, `${locale}: says it is not a platform plan`).toContain("LabourMarket.ai");
      // No tariff figure anywhere in the block: the public wording is the owner's.
      expect(JSON.stringify(c), `${locale}: no figure`).not.toMatch(/\d{2,}/);
    }
  });

  for (const locale of activeLocales) {
    it(`${locale}: free registration and posting are said, the paid plan is not purchasable, prices are ex VAT`, () => {
      const m = JSON.parse(read(`messages/${locale}.json`));
      // One sentence per fact, in every routed language.
      expect(m.pricing.subcopyConfirmed.split(". ").length, "free / one paid plan / not purchasable").toBeGreaterThanOrEqual(3);
      expect(m.pricing.priceState.owner_confirmed_closed).toMatch(/VAT|PVM|НДС|MwSt|btw/);
      expect(m.pricing.priceState.owner_confirmed).toMatch(/VAT|PVM|НДС|MwSt|btw/);
      // A hiring fee is never stated without "agreed in advance"; no figure is published.
      const fee = m.conciergeOffer.steps[3].body;
      expect(fee, `${locale}: no fee figure`).not.toMatch(/\d/);
    });
  }

  for (const locale of activeLocales) {
    it(`${locale}: closed sentences promise no payment and no unenforced limit`, () => {
      const m = JSON.parse(read(`messages/${locale}.json`));
      const p = m.pricing;
      expect(p.faqBillingClosed, `${locale}: superseded by faqClosed`).toBeUndefined();
      expect(p.faqClosed, `${locale} faqClosed aligned with faq`).toHaveLength(p.faq.length);
      const closed = [p.priceState.owner_confirmed_closed, ...p.faqClosed, ...p.plans.free.featuresClosed];
      for (const s of closed) {
        expect(s, `${locale}: ${s}`).not.toMatch(/Stripe/);
        expect(s, `${locale}: ${s}`).not.toMatch(POSITION_COUNT);
      }
      // The live billing answer is still the Stripe one (returns when open).
      expect(p.faq[2].a, `${locale} faq[2]`).toMatch(/Stripe/);
      expect(p.plans.free.featuresClosed).toHaveLength(p.plans.free.features.length);

      // Always-rendered public copy states no position limit at all.
      for (const s of [m.companies.faq.items[1].a, m.agencies.faq.items[1].a, m.conciergeOffer.note]) {
        expect(s, `${locale}: ${s}`).not.toMatch(POSITION_COUNT);
      }
      // The plan boundary (rendered only while billing is off) qualifies
      // every numeric limit: it applies once paid plans start, not today.
      expect(m.planBoundary.limitValue).toContain("{count}");
      expect(m.planBoundary.limitValue.replace("{count}", "").trim().split(/\s+/).length).toBeGreaterThan(2);
    });
  }
});
