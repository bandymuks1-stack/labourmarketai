import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AudienceFacts, type AudienceFactsCopy } from "@/components/marketing/audience-facts";
import { BenefitCards } from "@/components/marketing/benefit-cards";
import { PageHero } from "@/components/marketing/page-hero";
import { INSTITUTION_DOOR_NEXT } from "@/lib/marketing/public-doors";
import { buildPageMetadataFor } from "@/lib/seo/metadata";

/**
 * FOR EDUCATION INSTITUTIONS — the page the institution sign-up door had no
 * "learn more" for (owner P0 2026-11-13: an institution could choose the door
 * and could not tell what it would be able to do).
 *
 * Every card states a function that works in production today (function
 * register rows 11.1–11.7). What does not work or is not built (11.8–11.10)
 * is named under "not available yet" and promised nowhere. The CTA is the
 * SAME destination as the landing's institution door: organisation setup with
 * the training-provider capability preselected.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor("education", locale, "/for-education");
}

export default async function ForEducationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.education");
  const benefits = t.raw("benefits") as { title: string; body: string }[];
  const facts = t.raw("facts") as AudienceFactsCopy;

  return (
    <>
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        accent={t("titleAccent")}
        subcopy={t("subcopy")}
        ctaKind="signup"
        ctaLabel={t("cta")}
        ctaSource="education_hero"
        ctaNext={INSTITUTION_DOOR_NEXT}
        ctaAudience="education"
      />
      <BenefitCards items={benefits} />
      <AudienceFacts copy={facts} />
    </>
  );
}
