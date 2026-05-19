import { getTranslations, setRequestLocale } from "next-intl/server";
import { BenefitCards } from "@/components/marketing/benefit-cards";
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
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        accent={t("titleAccent")}
        subcopy={t("subcopy")}
        ctaSource="companies_hero"
      />
      <BenefitCards items={benefits} />
      <RoleEnrichment
        root="companies"
        previewKey="demand"
        preview={<DemandPreviewCard id="demand.featured.1" />}
        ctaSource="companies_cta"
        ctaIntent="hire_workers"
      />
    </>
  );
}
