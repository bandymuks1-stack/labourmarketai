import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { resolveActiveLocale } from "@/lib/seo/metadata";
import { readLivingMarketPublicSnapshot } from "@/lib/market/living-market-public";
import {
  LivingLabourMarket,
  type LivingMarketLabels,
} from "./living-labour-market";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Living Labour Market — owner review",
  description:
    "Isolated owner-review surface for the coded labourmarket.ai world.",
  robots: { index: false, follow: false },
};

export default async function LivingLabourMarketPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const activeLocale = resolveActiveLocale(locale);
  setRequestLocale(activeLocale);

  const [market, tLanding, tNav, tProf] = await Promise.all([
    readLivingMarketPublicSnapshot(),
    getTranslations("landing"),
    getTranslations("nav"),
    getTranslations("professions"),
  ]);

  const labels: LivingMarketLabels = {
    headline: tLanding("chain.title"),
    subline: tLanding("chain.steps.journal.body"),
    openJobs: tNav("jobs"),
    workers: tNav("workers"),
    companies: tNav("companies"),
    live: tLanding("marketProof.eyebrow"),
    illustrative: tLanding("hero.demoBadge"),
    vacancies: tLanding("marketProof.stats.vacancies.label"),
    employers: tLanding("marketProof.stats.employers.label"),
    regions: tLanding("marketProof.stats.regions.label"),
    dataNote: tLanding("marketProof.asOfNote"),
    inspectHint: tLanding("hero.mapHint"),
    opportunityAction: tLanding("chain.steps.next.title"),
    stages: [
      tLanding("hero.mapLabel"),
      tLanding("chain.steps.need.title"),
      tLanding("chain.steps.person.title"),
      tLanding("chain.steps.work.title"),
      tLanding("chain.steps.journal.title"),
      tLanding("chain.steps.skills.title"),
      tLanding("chain.steps.next.title"),
    ],
    canvasLabel: `${tLanding("hero.mapLabel")} — ${tLanding("loop.chip")}`,
  };

  return (
    <LivingLabourMarket
      locale={activeLocale}
      worldOnly={query.view === "world-only"}
      labels={labels}
      market={{
        ...market,
        sectors: market.sectors.map((sector) => ({
          ...sector,
          label: tProf(sector.professionSlug as never),
          formattedCount:
            sector.totalCount === null
              ? undefined
              : new Intl.NumberFormat(activeLocale).format(sector.totalCount),
        })),
      }}
    />
  );
}
