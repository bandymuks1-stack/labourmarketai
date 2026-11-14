import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AudienceFacts, type AudienceFactsCopy } from "@/components/marketing/audience-facts";
import { BenefitCards } from "@/components/marketing/benefit-cards";
import { PageHero } from "@/components/marketing/page-hero";
import { buildPageMetadataFor } from "@/lib/seo/metadata";

/**
 * FOR SERVICE PROVIDERS AND TEAMS — independent specialists, crews and
 * service companies in ANY field (never one trade; axiom A-13).
 *
 * Every card states a function that works in production today (function
 * register rows 6.1, 6.3, 6.6, 6.10). What is not built (6.13, 6.14, 6.21,
 * 6.23) is named under "not available yet". The CTA lands on the person's
 * own service offerings after sign-up — the first useful action.
 */
const SERVICES_AFTER_SIGNUP = "/dashboard/services";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor("serviceProviders", locale, "/for-service-providers");
}

export default async function ForServiceProvidersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.serviceProviders");
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
        ctaSource="service_providers_hero"
        ctaNext={SERVICES_AFTER_SIGNUP}
        ctaAudience="service_providers"
      />
      <BenefitCards items={benefits} />
      <AudienceFacts copy={facts} />
    </>
  );
}
