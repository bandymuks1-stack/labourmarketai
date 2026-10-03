import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ExploreSteps } from "@/components/marketing/public/explore-steps";
import { PublicCtaEnd, PublicFaq } from "@/components/marketing/public/public-sections";
import { CompanyNeedMoment } from "@/components/marketing/public/product-moments";
import { CompaniesWorldHero } from "@/components/marketing/public/world-heroes";
import { CinematicStorySection } from "@/components/marketing/public/cinematic-story-section";
import { buildPageMetadataFor } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor("companies", locale, "/for-companies");
}

/**
 * /for-companies — the canonical COMPANY acquisition destination, in the same
 * world as the homepage and the product after login.
 *
 * A real workplace and its people fill the first screen: what needs the owner,
 * the project, the team. Then one continuous cinematic story follows the same record from work to
 * history while the company gains context; then how a need meets a person. "Build a whole
 * team" and capacity planning are NOT claimed: the product does not support
 * them yet (see the truth table). The one action is the canonical demand entry.
 */
export default async function ForCompaniesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("publicSlice.companies");

  return (
    <>
      <CompaniesWorldHero />
      <CinematicStorySection world="hospitality" audience="companies" />
      <CompanyNeedMoment />
      <ExploreSteps audience="companies" />
      <PublicFaq audience="companies" />
      <PublicCtaEnd
        title={t("cta.title")}
        accent={t("cta.accent")}
        label={t("cta.button")}
        href="/company-need"
        ctaId="companies_cta"
        audience="companies"
      />
    </>
  );
}
