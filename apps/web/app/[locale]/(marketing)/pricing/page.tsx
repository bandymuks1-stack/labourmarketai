import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHero } from "@/components/marketing/page-hero";
import { PricingTable } from "@/components/marketing/pricing-table";
import { ServiceOffers } from "@/components/marketing/service-offers";
import { PrePaymentPlanBoundary } from "@/components/marketing/pre-payment-plan-boundary";

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
      <PricingTable />
      <PrePaymentPlanBoundary />
      <ServiceOffers />

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
