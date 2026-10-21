import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPageMetadataFor } from "@/lib/seo/metadata";
import { WorkLifecycleSection } from "@/components/marketing/work-lifecycle-section";
import { BenefitCards } from "@/components/marketing/benefit-cards";
import { Link } from "@/lib/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor("companies", locale, "/for-companies");
}
import { PageHero } from "@/components/marketing/page-hero";
import { RoleEnrichment } from "@/components/marketing/role-enrichment";

export default async function ForCompaniesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
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
      <section className="mx-auto max-w-container px-6 pb-12 sm:px-12">
        <div className="card-border flex flex-col gap-2 p-5" data-testid="companies-calculator-link">
          <p className="text-sm leading-relaxed text-text-secondary">{t("calculatorBody")}</p>
          <Link
            href="/calculators/project-cost"
            className="w-fit text-sm font-semibold text-text-primary hover:text-brand-cyan"
          >
            {t("calculatorLink")} →
          </Link>
        </div>
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
