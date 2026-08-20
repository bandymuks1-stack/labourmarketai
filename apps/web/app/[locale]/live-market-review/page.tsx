import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { resolveActiveLocale } from "@/lib/seo/metadata";
import { readLiveMarketLandingSnapshot } from "@/lib/market/live-market-landing";
import {
  LiveMarketCommand,
  type LiveMarketCommandLabels,
} from "./live-market-command";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "labourmarket.ai",
  robots: { index: false, follow: false },
};

export default async function LiveMarketReviewPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale: requestedLocale } = await params;
  const locale = resolveActiveLocale(requestedLocale);
  setRequestLocale(locale);

  const [market, landing, nav, professions] = await Promise.all([
    readLiveMarketLandingSnapshot(),
    getTranslations("landing"),
    getTranslations("nav"),
    getTranslations("professions"),
  ]);

  const labels: LiveMarketCommandLabels = {
    brand: "labourmarket.ai",
    headline: landing("chain.title"),
    eyebrow: landing("marketProof.eyebrow"),
    mapLabel: landing("hero.mapLabel"),
    conceptual: landing("hero.demoBadge"),
    jobs: nav("jobs"),
    workers: nav("workers"),
    companies: nav("companies"),
    vacancies: landing("marketProof.stats.vacancies.label"),
    employers: landing("marketProof.stats.employers.label"),
    regions: landing("marketProof.stats.regions.label"),
    professionsTitle: landing("marketProof.topTitle"),
    jobsAction: landing("chain.steps.next.title"),
    basisNote: landing("marketProof.asOfNote"),
    workerCta: landing("cta.worker"),
    employerCta: landing("cta.employer"),
    workerLead: landing("workers.lead"),
    employerLead: landing("employers.lead"),
    stages: [
      landing("hero.mapLabel"),
      landing("marketProof.topTitle"),
      landing("chain.steps.journal.title"),
      landing("chain.steps.next.title"),
    ],
    evidenceSteps: [
      landing("chain.steps.work.title"),
      landing("chain.steps.journal.title"),
      landing("chain.steps.skills.title"),
      landing("chain.steps.next.title"),
    ],
  };

  return (
    <LiveMarketCommand
      locale={locale}
      market={{
        ...market,
        professions: market.professions.map((profession) => ({
          ...profession,
          label: professions(profession.slug),
        })),
      }}
      labels={labels}
    />
  );
}
