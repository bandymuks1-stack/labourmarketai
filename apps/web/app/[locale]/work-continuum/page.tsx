import type { Metadata } from "next";
import { connection } from "next/server";
import { setRequestLocale } from "next-intl/server";
import { WORKFLOW_DEFAULT_PACK } from "@/lib/approvals/approvals-model";
import { SWEDEN_COVERAGE_CURRENT } from "@/lib/analytics/market-coverage-claims";
import { resolveActiveLocale } from "@/lib/seo/metadata";
import { PLANNING_VIEWS } from "@/lib/planning/planning-model";
import {
  readPublicVacancySupplyCounts,
  searchPublicVacancyPreviews,
} from "@/lib/vacancy-store/public-vacancy-preview";
import {
  WorkContinuumLanding,
  type WorkContinuumJob,
  type WorkContinuumSector,
  type WorkContinuumSupply,
} from "./work-continuum-landing";

/**
 * Owner-review surface only. This route deliberately lives outside the
 * marketing route group, so it cannot mutate or inherit the frozen landing's
 * composition. It reads only the restricted anonymous vacancy projection and
 * stays excluded from indexing until the owner approves a production direction.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Living Labour Market — labourmarket.ai owner review",
  description:
    "An isolated coded exploration of the labour market as a living product interface.",
  robots: { index: false, follow: false },
};

const measuredFloor: WorkContinuumSupply = {
  activeVacancies: SWEDEN_COVERAGE_CURRENT.activeVacanciesFloor,
  distinctEmployers: SWEDEN_COVERAGE_CURRENT.identifiedEmployersFloor,
  regions: SWEDEN_COVERAGE_CURRENT.regions,
  lastRefreshedAt: null,
  basis: "measured-floor",
};

const sectorDefinitions = [
  {
    id: "agriculture",
    label: "Agriculture",
    signalLabel: "Farm work",
    professionSlug: "farm_worker",
  },
  {
    id: "hospitality",
    label: "Hospitality",
    signalLabel: "Kitchen work",
    professionSlug: "cook",
  },
  {
    id: "logistics",
    label: "Logistics",
    signalLabel: "Driving",
    professionSlug: "driver",
  },
  {
    id: "production",
    label: "Production",
    signalLabel: "Production work",
    professionSlug: "production_worker",
  },
  {
    id: "construction",
    label: "Construction",
    signalLabel: "Carpentry",
    professionSlug: "carpenter",
  },
  {
    id: "care",
    label: "Care",
    signalLabel: "Care work",
    professionSlug: "caregiver",
  },
  {
    id: "technology",
    label: "Technology",
    signalLabel: "Software work",
    professionSlug: "software_developer",
  },
] as const;

async function readWithOneRetry<T>(
  reader: () => Promise<T>,
): Promise<T | null> {
  try {
    return await reader();
  } catch {
    try {
      return await reader();
    } catch {
      return null;
    }
  }
}

type VacancySearch = Awaited<ReturnType<typeof searchPublicVacancyPreviews>>;

function toJob(vacancy: VacancySearch["vacancies"][number]): WorkContinuumJob {
  return {
    id: vacancy.id,
    title: vacancy.title,
    professionSlug: vacancy.professionSlug,
    occupation: vacancy.occupation,
    employmentForm: vacancy.employmentForm,
    workingTime: vacancy.workingTime,
    positions: vacancy.positions,
    sourceLanguage: vacancy.sourceLanguage,
    publishedAt: vacancy.publishedAt,
    attributionCode: vacancy.attributionCode,
  };
}

async function readContinuumData(): Promise<{
  supply: WorkContinuumSupply;
  sectors: WorkContinuumSector[];
}> {
  const [supplyResult, ...sectorResults] = await Promise.all([
    readWithOneRetry(() => readPublicVacancySupplyCounts()),
    ...sectorDefinitions.map((sector) =>
      readWithOneRetry(() =>
        searchPublicVacancyPreviews({
          professionSlug: sector.professionSlug,
          page: 1,
        }),
      ),
    ),
  ]);

  const supply: WorkContinuumSupply =
    supplyResult?.status === "ok"
      ? {
          activeVacancies: supplyResult.activeVacancies,
          distinctEmployers: supplyResult.distinctEmployers,
          regions: SWEDEN_COVERAGE_CURRENT.regions,
          lastRefreshedAt: supplyResult.lastRefreshedAt,
          basis: "live",
        }
      : measuredFloor;

  const sectors: WorkContinuumSector[] = sectorDefinitions.map(
    (definition, index) => {
      const result = sectorResults[index];
      return {
        ...definition,
        totalCount: result?.status === "ok" ? result.totalCount : null,
        jobs:
          result?.status === "ok"
            ? result.vacancies.slice(0, 3).map(toJob)
            : [],
        basis: result?.status === "ok" ? "live" : "unavailable",
      };
    },
  );

  // The route degrades honestly: the dated governed supply floor can orient a
  // visitor during a local DB outage, while each profession signal explicitly
  // becomes unavailable instead of fabricating a sector count or a live claim.
  return { supply, sectors };
}

export default async function WorkContinuumPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const activeLocale = resolveActiveLocale(locale);
  const proofMode = query.proof === "living-world";
  const worldOnly = proofMode && query.view === "world-only";
  setRequestLocale(activeLocale);
  // The signals are a current public-supply projection, not build-time copy.
  // Waiting for a request keeps the isolated review route dynamic even though
  // the parent locale segment exposes static parameters for marketing pages.
  await connection();
  const { supply, sectors } = await readContinuumData();

  return (
    <WorkContinuumLanding
      locale={activeLocale}
      supply={supply}
      sectors={sectors}
      planningViews={[...PLANNING_VIEWS]}
      approvalContexts={WORKFLOW_DEFAULT_PACK.map((template) => ({
        slug: template.slug,
        contextEntityType: template.contextEntityType,
        deadlineHours: template.deadlineHours,
      }))}
      proofMode={proofMode}
      worldOnly={worldOnly}
    />
  );
}
