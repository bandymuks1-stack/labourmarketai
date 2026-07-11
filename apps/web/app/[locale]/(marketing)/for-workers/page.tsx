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
  return buildPageMetadataFor("workers", locale, "/for-workers");
}
import { PageHero } from "@/components/marketing/page-hero";
import { RoleEnrichment } from "@/components/marketing/role-enrichment";
import { ExamplePreviewFrame } from "@/components/marketing/example-preview-frame";
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
        ctaKind="signup"
        ctaLabel={t("cta")}
        ctaSource="workers_hero"
      />
      <BenefitCards items={benefits} />
      <RoleEnrichment
        root="workers"
        previewKey="profile"
        preview={
          <ExamplePreviewFrame>
            <PlayerCard id="workers.featured.1" />
          </ExamplePreviewFrame>
        }
        ctaSource="workers_cta"
        ctaKind="signup"
      />
    </>
  );
}
