import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPageMetadata, buildPageMetadataFor, resolveActiveLocale } from "@/lib/seo/metadata";
import { WorkLifecycleSection } from "@/components/marketing/work-lifecycle-section";
import { BenefitCards } from "@/components/marketing/benefit-cards";
import { Link } from "@/lib/i18n/navigation";
import { Card } from "@/components/ui/Card";
import {
  EMPLOYER_INTENTS,
  type EmployerIntent,
  employerIntentNeedQuery,
  employerIntentPath,
  employerMarketNeedQuery,
  employerMarketPath,
  readEmployerIntent,
  readEmployerMarket,
} from "@/lib/marketing/employer-markets";

const EMPLOYER_INTENT_KEYS = Object.keys(EMPLOYER_INTENTS) as EmployerIntent[];

type SearchParams = Promise<{ market?: string | string[]; need?: string | string[] }>;

/**
 * The focused version a URL asks for: a market (`?market=lu`) or a B2B intent
 * (`?need=subcontracting`), each its own self-canonical page. A market wins
 * when both are present. Null = the plain page.
 */
async function readFocus(searchParams: SearchParams) {
  const sp = await searchParams;
  const market = readEmployerMarket(sp.market);
  if (market) {
    return {
      namespace: `pages.companies.markets.${market}`,
      path: employerMarketPath(market),
      testId: `employer-market-${market}`,
      ctaSource: `companies_market_${market}`,
      needQuery: employerMarketNeedQuery(market),
    };
  }
  const intent = readEmployerIntent(sp.need);
  if (intent) {
    return {
      namespace: `pages.companies.needs.${intent}`,
      path: employerIntentPath(intent),
      testId: `employer-need-${intent}`,
      ctaSource: `companies_need_${intent}`,
      needQuery: employerIntentNeedQuery(intent),
    };
  }
  return null;
}
type Focus = NonNullable<Awaited<ReturnType<typeof readFocus>>>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { locale } = await params;
  const focus = await readFocus(searchParams);
  if (!focus) return buildPageMetadataFor("companies", locale, "/for-companies");
  // A market or intent version is its own indexable page: self-canonical, its
  // own hreflang set and sitemap entry. Advert `utm_*` parameters fall away here.
  const t = await getTranslations({ locale: resolveActiveLocale(locale), namespace: focus.namespace });
  return buildPageMetadata({
    locale: resolveActiveLocale(locale),
    path: focus.path,
    title: t("metaTitle"),
    description: t("metaDescription"),
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
  const focus = await readFocus(searchParams);
  if (focus) return <EmployerFocusVersion focus={focus} />;

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
      {/* The B2B intent versions, linked from the page they belong to (not only
          the sitemap): a crew or subcontractor, or a staffing partner. */}
      <section className="mx-auto max-w-container px-6 pb-12 sm:px-12" data-testid="companies-need-links">
        <Card compact className="flex flex-col gap-2">
          {EMPLOYER_INTENT_KEYS.map((intent) => (
            <Link
              key={intent}
              href={employerIntentPath(intent)}
              className="w-fit text-sm font-semibold text-text-primary hover:text-brand-cyan"
            >
              {t(`needs.${intent}.metaTitle`)} →
            </Link>
          ))}
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
 * A focused employer version: a market's advert page (owner order 2026-11-10)
 * or a B2B intent page (owner P1 2026-11-11). One headline, three plain points,
 * ONE call to action, the company-need entry with the country or the
 * engagement model already chosen. Nothing else on the page competes with it.
 */
async function EmployerFocusVersion({ focus }: { focus: Focus }) {
  const t = await getTranslations(focus.namespace);
  const points = t.raw("points") as string[];
  return (
    <div data-testid={focus.testId}>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        accent={t("titleAccent")}
        subcopy={t("subcopy")}
        ctaKind="companyNeed"
        ctaLabel={t("cta")}
        ctaSource={focus.ctaSource}
        ctaAudience="companies"
        ctaNeedQuery={focus.needQuery}
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
