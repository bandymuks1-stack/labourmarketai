import { getTranslations, setRequestLocale } from "next-intl/server";
import { resolveActiveLocale } from "@/lib/seo/metadata";
import { readLiveMarketLandingSnapshot } from "@/lib/market/live-market-landing";
import {
  LiveMarketCommand,
  type LiveMarketCommandLabels,
} from "./live-market-command";

export async function LiveMarketLanding({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale: requestedLocale } = await params;
  const locale = resolveActiveLocale(requestedLocale);
  setRequestLocale(locale);

  const [market, review, landing, hero, nav, professions, domains, live] =
    await Promise.all([
      readLiveMarketLandingSnapshot(),
      getTranslations("livingMarketReview"),
      getTranslations("landing"),
      getTranslations("hero"),
      getTranslations("nav"),
      getTranslations("professions"),
      getTranslations("workEntryReview.domain"),
      getTranslations("live"),
    ]);

  const labels: LiveMarketCommandLabels = {
    brand: "labourmarket.ai",
    tagline: review("tagline"),
    headline: review("headline"),
    headlineAccent: review("headlineAccent"),
    support: review("support"),
    evidence: review("evidence"),
    workerCta: review("workerCta"),
    employerCta: review("employerCta"),
    workerLead: landing("workers.lead"),
    employerLead: landing("employers.lead"),
    workerAction: hero("ctaPrimary"),
    employerAction: hero("businessLink"),
    workers: nav("workers"),
    companies: nav("companies"),
    how: nav("how"),
    login: nav("login"),
    menuOpen: nav("menuOpen"),
    menuClose: nav("menuClose"),
    live: landing("marketProof.eyebrow"),
    currentSupply: review("currentSupply"),
    visualNote: live("counters.previewNote"),
    vacancies: landing("marketProof.stats.vacancies.label"),
    employers: landing("marketProof.stats.employers.label"),
    regions: landing("marketProof.stats.regions.label"),
    professionsTitle: landing("marketProof.topTitle"),
    opportunityStream: review("opportunityStream"),
    basisNote: landing("marketProof.asOfNote"),
    sectorTitle: landing("loop.sectorsLabel"),
    sectors: {
      construction: domains("construction"),
      logistics: domains("driving_logistics"),
      care: domains("care"),
      hospitality: domains("cooking"),
      manufacturing: professions("production_worker"),
      technology: domains("it"),
      agriculture: professions("farm_worker"),
      warehousing: domains("warehouse"),
      services: domains("cleaning"),
      energy: domains("electrical"),
    },
    eventSteps: [
      {
        title: landing("chain.steps.need.title"),
        body: landing("chain.steps.need.body"),
      },
      {
        title: landing("chain.steps.person.title"),
        body: landing("chain.steps.person.body"),
      },
      {
        title: landing("chain.steps.work.title"),
        body: landing("chain.steps.work.body"),
      },
      {
        title: landing("chain.steps.journal.title"),
        body: landing("chain.steps.journal.body"),
      },
      {
        title: review("evidenceVerifiedTitle"),
        body: review("evidenceVerifiedBody"),
      },
      {
        title: review("capabilityGrowsTitle"),
        body: review("capabilityGrowsBody"),
      },
      {
        title: landing("chain.steps.next.title"),
        body: landing("chain.steps.next.body"),
      },
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
