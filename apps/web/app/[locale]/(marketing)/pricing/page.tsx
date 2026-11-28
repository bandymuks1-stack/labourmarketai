import { ChevronDown } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPageMetadataFor } from "@/lib/seo/metadata";
import { PageHero } from "@/components/marketing/page-hero";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor("pricing", locale, "/pricing");
}
import { PricingTable } from "@/components/marketing/pricing-table";
import { PilotPassInvite } from "@/components/app/pilot-pass-invite";
import { PrePaymentPlanBoundary } from "@/components/marketing/pre-payment-plan-boundary";
import { getBillingConfigFor } from "@/lib/billing/config";
import { isStripeActive } from "@/lib/billing/config-core";
import { isCheckoutCancelledReturn } from "@/lib/billing/checkout-return-core";
import { PRICING_READINESS_STATE } from "@/lib/billing/readiness";
import {
  ConciergeAccessBanner,
  ConciergeOfferSection,
} from "@/components/marketing/concierge-offer";
import { faqPageJsonLd } from "@/lib/seo/faq-json-ld";
import { jsonLdScript } from "@/lib/seo/json-ld";

// getPlans() reads the live `plans` table; keep this page request-time so
// the build never needs Supabase. It degrades gracefully if unreachable.
export const dynamic = "force-dynamic";

export default async function PricingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ billing?: string }>;
}) {
  const { locale } = await params;
  // Native-nav `?billing=test_cancelled` / `?billing=cancelled` return
  // feedback: the checkout route's cancel URL points here (the `test_`
  // prefix follows the adapter's mode), and until now nothing read it — a
  // person backing out of a checkout landed with no acknowledgement. The
  // notice states only what is true (nothing charged, nothing changed); it
  // never implies a purchase was possible. 2026-09-22: the LIVE flag was
  // measured unrecognised (only `test_cancelled` rendered); both now classify
  // through checkout-return-core.
  const { billing } = await searchParams;
  // LIVE Stripe (owner-armed) changes the page's own words: the hero no longer
  // says prices are not final, and the pre-payment boundary is not shown.
  const billingLive = isStripeActive(getBillingConfigFor(null));
  // The hero words and the hero CTA follow the REAL readiness state, never a
  // static sentence: (1) prices not confirmed -> "not finalised" + waitlist;
  // (2) prices confirmed but no Stripe adapter armed -> "confirmed, online
  // activation not open" + waitlist; (3) confirmed AND billing armed ->
  // "confirmed and in force" + the organization-account CTA (no waitlist).
  const pricesConfirmed = PRICING_READINESS_STATE === "owner_confirmed";
  const activationOpen = pricesConfirmed && billingLive;
  setRequestLocale(locale);
  const t = await getTranslations("pricing");
  // The live answers ("card payment through Stripe, invoices in your
  // account", "1 active position free") are true only once activation is
  // open: the free-plan limit is enforced only where billing is armed
  // (lib/billing/open-needs-gate.ts is permissive otherwise). Until then
  // every question keeps its wording and gets its closed-state answer, by
  // position (owner P0 2026-11-10 + owner approval 2026-11-12 (b)).
  const faqClosed = t.raw("faqClosed") as string[];
  const faq = (t.raw("faq") as { q: string; a: string }[]).map((item, i) =>
    activationOpen ? item : { q: item.q, a: faqClosed[i] ?? item.a },
  );
  // The same items the list below renders (AEO, decision 0009) — including
  // the closed-state answers, so search engines read what visitors read.
  const faqLd = faqPageJsonLd(faq, locale);

  return (
    <>
      {/* Revenue funnel (2026-10-19): who saw the price. Once per tab session. */}
      <TelemetryView event={FUNNEL_EVENTS.pricingViewed} metadata={{ surface: "pricing" }} />
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        accent={t("titleAccent")}
        subcopy={
          activationOpen
            ? t("subcopyLive")
            : pricesConfirmed
              ? t("subcopyConfirmed")
              : t("subcopy")
        }
        ctaKind={activationOpen ? "signup" : "waitlist"}
        ctaLabel={activationOpen ? t("ctaSubscribe") : t("planCta")}
        ctaSource="pricing_hero"
        ctaNext={activationOpen ? "/dashboard/account" : undefined}
        ctaAudience={activationOpen ? "companies" : undefined}
      />
      {isCheckoutCancelledReturn(billing) ? (
        <div className="mx-auto max-w-container px-6 sm:px-12">
          <p
            className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-4 py-3 text-sm text-text-primary"
            data-testid="pricing-checkout-cancelled"
          >
            {t("checkoutReturn.cancelled")}
          </p>
        </div>
      ) : null}
      {/* The organization pilot pass, for the signed-in owner it is offered
          to — public billing stays off, so without this the pricing page told
          that owner payments were not open (2026-10-22). */}
      <div className="mx-auto max-w-container px-6 sm:px-12">
        <PilotPassInvite />
      </div>
      {/* Public commercial surface only: the technical billing state banner
          and the Stripe TEST checkout moved to the superadmin-gated
          /dashboard/admin/billing (launch repair Scope C). */}
      <ConciergeAccessBanner />
      <PricingTable />
      {/* The pre-payment boundary explained "payments not enabled"; once the
          Stripe adapter is LIVE that sentence would be false, so the block is
          not rendered — the canonical PricingTable above is the truth. */}
      {billingLive ? null : <PrePaymentPlanBoundary />}
      {/* The recruitment SERVICE of UAB "Nonstop Group" is not a platform plan
          (owner correction 2026-11-13): it sits BELOW the plans in its own
          labelled block, so a service fee is never read as platform pricing. */}
      <ConciergeOfferSection />
      {/* M7 (beta foundation audit 2026-08-08): <ServiceOffers /> — the
          AI-automation agency offer list (€900–€1,900) — is NOT rendered on
          the beta labour-market pricing page. Concrete service prices next to
          the labour-market tiers, whose own price is "being prepared", read as
          this product's price and sell a different business. The component and
          its `services.*` copy are kept intact and unchanged; the owner decides
          where the offers belong (a separate /services page is the obvious
          home). Pinned by lib/guards/pricing-page-beta-honesty.test.ts. */}

      <section className="mx-auto max-w-container px-6 pb-16 pt-10 sm:px-12" data-testid="pricing-faq">
        <h2 className="font-display text-xl font-bold tracking-tightest text-text-primary">
          {t("faqTitle")}
        </h2>
        {/* A question is its own line; the answer opens on a tap and stays in
            the document (owner 2026-11-24, decisions 0032 / 0034). */}
        <div className="mt-4 divide-y divide-ink-600/60 border-y border-ink-600/60">
          {faq.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue [&::-webkit-details-marker]:hidden">
                <span className="font-display text-base font-semibold text-text-primary">{item.q}</span>
                <ChevronDown
                  aria-hidden
                  className="size-4 shrink-0 text-text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <p className="max-w-3xl pb-4 text-sm leading-relaxed text-text-secondary">{item.a}</p>
            </details>
          ))}
        </div>
        {faqLd ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(faqLd) }} />
        ) : null}
      </section>
    </>
  );
}
