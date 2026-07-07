import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPageMetadataFor } from "@/lib/seo/metadata";
import { BenefitCards } from "@/components/marketing/benefit-cards";

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
import { DemandPreviewCard } from "@/components/app/demand-preview-card";

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
      />
      <BenefitCards items={benefits} />
      <RoleEnrichment
        root="companies"
        previewKey="demand"
        preview={<DemandPreviewCard id="demand.featured.1" />}
        ctaSource="companies_cta"
        ctaKind="signup"
      />
    </>
  );
}
