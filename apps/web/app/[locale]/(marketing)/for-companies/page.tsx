import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPageMetadata, buildPageMetadataFor, resolveActiveLocale } from "@/lib/seo/metadata";
import { WorkLifecycleSection } from "@/components/marketing/work-lifecycle-section";
import { BenefitCards } from "@/components/marketing/benefit-cards";
import { Link } from "@/lib/i18n/navigation";
import { Card } from "@/components/ui/Card";
import {
  employerMarketNeedQuery,
  readEmployerMarket,
  type EmployerMarket,
} from "@/lib/marketing/employer-markets";

type SearchParams = Promise<{ market?: string | string[] }>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { locale } = await params;
  const market = readEmployerMarket((await searchParams).market);
  if (!market) return buildPageMetadataFor("companies", locale, "/for-companies");
  // A market version keeps the page's own canonical and hreflang set: one
  // indexable page, the advert copy on top of it.
  const t = await getTranslations({ locale: resolveActiveLocale(locale), namespace: "pages.companies.markets" });
  return buildPageMetadata({
    locale: resolveActiveLocale(locale),
    path: "/for-companies",
    title: t(`${market}.metaTitle`),
    description: t(`${market}.metaDescription`),
  });
}
import { PageHero } from "@/components/marketing/page-hero";
import { RoleEnrichment } from "@/components/marketing/role-enrichment";

export default async function ForCompaniesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const market = readEmployerMarket((await searchParams).market);
  if (market) return <EmployerMarketVersion market={market} />;

  const t = await getTranslations("pages.companies");
  const benefits = t.raw("benefits") as { title: string; body: string }[];

  return (
    <>
      {/* Educational page; the action CTA routes into the canonical demand
          entry (/company-need), not a second competing intake path. */}
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        accent={t("titleAccent")}
        subcopy={t("subcopy")}
        ctaKind="companyNeed"
        ctaLabel={t("cta")}
        ctaSource="companies_hero"
        ctaAudience="companies"
      />
      <WorkLifecycleSection audience="companies" />
      <BenefitCards items={benefits} />
      {/* The public project-cost calculator (the same estimate engine as the
          demand wizard) — a company sizes the work before it asks for it. */}
      <section className="mx-auto max-w-container px-6 pb-12 sm:px-12" data-testid="companies-calculator-link">
        <Card compact className="flex flex-col gap-2">
          <p className="text-sm leading-relaxed text-text-secondary">{t("calculatorBody")}</p>
          <Link
            href="/calculators/project-cost"
            className="w-fit text-sm font-semibold text-text-primary hover:text-brand-cyan"
          >
            {t("calculatorLink")} →
          </Link>
        </Card>
      </section>
      <RoleEnrichment
        root="companies"
        previewKey="demand"
        ctaSource="companies_cta"
        ctaKind="signup"
      />
    </>
  );
}

/**
 * The employer advert version (owner order 2026-11-10): one headline, three
 * plain points, ONE call to action — the company-need entry with the country
 * already chosen. Nothing else on the page competes with it.
 */
async function EmployerMarketVersion({ market }: { market: EmployerMarket }) {
  const t = await getTranslations(`pages.companies.markets.${market}`);
  const points = t.raw("points") as string[];
  return (
    <div data-testid={`employer-market-${market}`}>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        accent={t("titleAccent")}
        subcopy={t("subcopy")}
        ctaKind="companyNeed"
        ctaLabel={t("cta")}
        ctaSource={`companies_market_${market}`}
        ctaAudience="companies"
        ctaNeedQuery={employerMarketNeedQuery(market)}
      />
      <section className="mx-auto max-w-container px-6 pb-16 sm:px-12">
        <Card compact>
          <ul className="flex flex-col gap-3 text-sm leading-relaxed text-text-secondary">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
