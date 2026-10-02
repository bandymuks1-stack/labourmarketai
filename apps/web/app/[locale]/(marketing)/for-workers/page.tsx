import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ExploreSteps } from "@/components/marketing/public/explore-steps";
import { PublicHero } from "@/components/marketing/public/public-hero";
import { PublicCtaEnd, PublicFaq } from "@/components/marketing/public/public-sections";
import {
  WorkerDayMoment,
  WorkerHistoryMoment,
  WorkerOutcome,
} from "@/components/marketing/public/product-moments";
import { WorkRecordTransitionSection } from "@/components/marketing/public/work-record-transition-section";
import { buildPageMetadataFor } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadataFor("workers", locale, "/for-workers");
}

/**
 * /for-workers — the canonical WORKER acquisition destination.
 *
 * One promise (find work), one differentiator (keep what you build through real
 * work), one action (create the free profile). The page proves it with focused
 * product moments in the order the worker lives it:
 *   hero → today and the record → the signature transition → the professional
 *   history → the outcome → straight answers → the same action again.
 * Every claim is traced in docs/public/PUBLIC_SLICE_TRUTH_TABLE_2026-10-02.md.
 */
export default async function ForWorkersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("publicSlice.workers");
  const ts = await getTranslations("publicSlice");
  const ti = await getTranslations("publicSlice.imagery");

  return (
    <>
      <PublicHero
        audience="workers"
        title={t("hero.title")}
        accent={t("hero.accent")}
        sub={t("hero.sub")}
        note={t("hero.note")}
        primary={{ label: t("hero.cta"), href: "/auth/signup", id: "workers_hero" }}
        secondary={{ label: t("hero.secondary"), href: "/jobs", id: "workers_hero_jobs" }}
        main="site"
        aside="kitchen"
        copy={{
          sample: ts("sample"),
          mainAlt: ti("tomasAlt"),
          mainCaption: ti("tomasCaption"),
          asideAlt: ti("rasaAlt"),
        }}
      />
      <WorkerDayMoment />
      <WorkRecordTransitionSection />
      <WorkerHistoryMoment />
      <WorkerOutcome />
      <ExploreSteps audience="workers" />
      <PublicFaq audience="workers" />
      <PublicCtaEnd
        title={t("cta.title")}
        accent={t("cta.accent")}
        label={t("cta.button")}
        href="/auth/signup"
        ctaId="workers_cta"
        audience="workers"
      />
    </>
  );
}
