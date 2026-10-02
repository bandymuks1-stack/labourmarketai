import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ExploreSteps } from "@/components/marketing/public/explore-steps";
import { PublicHero } from "@/components/marketing/public/public-hero";
import { PublicCtaEnd, PublicFaq } from "@/components/marketing/public/public-sections";
import {
  CompanyAttentionMoment,
  CompanyNeedMoment,
  CompanyProjectMoment,
} from "@/components/marketing/public/product-moments";
import { WorkRecordTransitionSection } from "@/components/marketing/public/work-record-transition-section";
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
 * /for-companies — the canonical COMPANY acquisition destination.
 *
 * One promise (find the people you need), one differentiator (then run the work
 * in the same place), one action (post what you need — the canonical demand
 * entry, never a second intake path). Proof moments, in the order a company
 * lives it: need → people → project → the signature transition → what needs
 * you and the next need. "Build a whole team" and capacity planning are NOT
 * claimed: the product does not support them yet (see the truth table).
 */
export default async function ForCompaniesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("publicSlice.companies");
  const ts = await getTranslations("publicSlice");
  const ti = await getTranslations("publicSlice.imagery");
  const tt = await getTranslations("publicSlice.transition");

  return (
    <>
      <PublicHero
        audience="companies"
        title={t("hero.title")}
        accent={t("hero.accent")}
        sub={t("hero.sub")}
        note={t("hero.note")}
        primary={{ label: t("hero.cta"), href: "/company-need", id: "companies_hero" }}
        secondary={{ label: t("hero.secondary"), href: "/pricing", id: "companies_hero_pricing" }}
        main="kitchen"
        aside="site"
        floating={{ text: tt("co.waiting"), state: "waiting" }}
        copy={{
          sample: ts("sample"),
          mainAlt: ti("rasaAlt"),
          mainCaption: ti("rasaCaption"),
          asideAlt: ti("tomasAlt"),
        }}
      />
      <CompanyNeedMoment />
      <CompanyProjectMoment />
      <WorkRecordTransitionSection />
      <CompanyAttentionMoment />
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
