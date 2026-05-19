import { getTranslations, setRequestLocale } from "next-intl/server";
import { BenefitCards } from "@/components/marketing/benefit-cards";
import { PageHero } from "@/components/marketing/page-hero";
import { RoleEnrichment } from "@/components/marketing/role-enrichment";
import { PlayerCard } from "@/components/app/player-card";

export default async function ForWorkersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.workers");
  const benefits = t.raw("benefits") as { title: string; body: string }[];

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        accent={t("titleAccent")}
        subcopy={t("subcopy")}
        ctaSource="workers_hero"
        ctaLabelKey="openAlt"
      />
      <BenefitCards items={benefits} />
      <RoleEnrichment
        root="workers"
        previewKey="profile"
        preview={<PlayerCard id="workers.featured.1" />}
        ctaSource="workers_cta"
        ctaIntent="find_job"
      />
    </>
  );
}
