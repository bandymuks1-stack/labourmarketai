import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPageMetadataFor } from "@/lib/seo/metadata";
import { PageHero } from "@/components/marketing/page-hero";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor("pricing", locale, "/pricing");
}
import { PricingTable } from "@/components/marketing/pricing-table";
import { PrePaymentPlanBoundary } from "@/components/marketing/pre-payment-plan-boundary";
import {
  ConciergeAccessBanner,
  ConciergeOfferSection,
} from "@/components/marketing/concierge-offer";

// getPlans() reads the live `plans` table; keep this page request-time so
// the build never needs Supabase. It degrades gracefully if unreachable.
export const dynamic = "force-dynamic";

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pricing");
  const faq = t.raw("faq") as { q: string; a: string }[];

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        accent={t("titleAccent")}
        subcopy={t("subcopy")}
        ctaKind="waitlist"
        ctaLabel={t("planCta")}
        ctaSource="pricing_hero"
      />
      {/* Public commercial surface only: the technical billing state banner
          and the Stripe TEST checkout moved to the superadmin-gated
          /dashboard/admin/billing (launch repair Scope C). */}
      <ConciergeAccessBanner />
      <ConciergeOfferSection />
      <PricingTable />
      <PrePaymentPlanBoundary />
      {/* M7 (beta foundation audit 2026-08-08): <ServiceOffers /> — the
          AI-automation agency offer list (€900–€1,900) — is NOT rendered on
          the beta labour-market pricing page. Concrete service prices next to
          the labour-market tiers, whose own price is "being prepared", read as
          this product's price and sell a different business. The component and
          its `services.*` copy are kept intact and unchanged; the owner decides
          where the offers belong (a separate /services page is the obvious
          home). Pinned by lib/guards/pricing-page-beta-honesty.test.ts. */}

      <section className="mx-auto max-w-container px-6 pb-20 sm:px-12">
        <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("faqTitle")}
        </h2>
        <dl className="mt-6 grid gap-6 md:grid-cols-2">
          {faq.map((item) => (
            <div key={item.q} className="card-border p-6">
              <dt className="font-display text-base font-semibold text-text-primary">
                {item.q}
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-text-secondary">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
