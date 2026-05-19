import { getTranslations, setRequestLocale } from "next-intl/server";
import { BenefitCards } from "@/components/marketing/benefit-cards";
import { PageHero } from "@/components/marketing/page-hero";
import { RoleEnrichment } from "@/components/marketing/role-enrichment";
import { AgencyPoolPreview } from "@/components/app/agency-pool-preview";

export default async function ForAgenciesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.agencies");
  const benefits = t.raw("benefits") as { title: string; body: string }[];

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        accent={t("titleAccent")}
        subcopy={t("subcopy")}
        ctaSource="agencies_hero"
      />
      <BenefitCards items={benefits} />
      <RoleEnrichment
        root="agencies"
        previewKey="pool"
        preview={<AgencyPoolPreview id="agency.pool.preview" />}
        ctaSource="agencies_cta"
        ctaIntent="partner"
      />
    </>
  );
}
