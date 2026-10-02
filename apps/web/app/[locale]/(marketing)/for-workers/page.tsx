import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ExploreSteps } from "@/components/marketing/public/explore-steps";
import { PublicCtaEnd, PublicFaq } from "@/components/marketing/public/public-sections";
import { WorkerHistoryMoment, WorkerOutcome } from "@/components/marketing/public/product-moments";
import { WorkersWorldHero } from "@/components/marketing/public/world-heroes";
import { CinematicStorySection } from "@/components/marketing/public/cinematic-story-section";
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
 * /for-workers — the canonical WORKER acquisition destination, in the same
 * world as the homepage and the product after login.
 *
 * A professional fills the first screen with today, the record and the
 * confirmation beside him; then one continuous cinematic story follows the same person through the
 * system (find, talk, join a project, work, record, confirm, history, next), then the
 * living history, the outcome, straight answers, and the one action again.
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

  return (
    <>
      <WorkersWorldHero />
      <CinematicStorySection audience="workers" />
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
