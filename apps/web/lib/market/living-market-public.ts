import "server-only";

import { SWEDEN_COVERAGE_CURRENT } from "@/lib/analytics/market-coverage-claims";
import {
  readPublicVacancySupplyCounts,
  searchPublicVacancyPreviews,
} from "@/lib/vacancy-store/public-vacancy-preview";

export type LivingMarketJob = {
  readonly id: string;
  readonly title: string;
  readonly professionSlug: string | null;
  readonly occupation: string | null;
};

export type LivingMarketSectorId =
  | "construction"
  | "logistics"
  | "manufacturing"
  | "care"
  | "hospitality"
  | "agriculture"
  | "technology"
  | "services";

export type LivingMarketSector = {
  readonly id: LivingMarketSectorId;
  readonly label: string;
  readonly activity: string;
  readonly professionSlug: string;
  readonly totalCount: number | null;
  readonly jobs: readonly LivingMarketJob[];
  readonly basis: "live" | "unavailable";
};

export type LivingMarketPublicSnapshot = {
  readonly activeVacancies: number;
  readonly distinctEmployers: number;
  readonly regions: number;
  readonly lastRefreshedAt: string | null;
  readonly basis: "live" | "measured-floor";
  readonly sectors: readonly LivingMarketSector[];
};

/**
 * Visual categories only. Counts and job rows still come from the canonical
 * anonymous vacancy RPCs below; this list is not a second store.
 */
const SECTORS = [
  {
    id: "construction",
    label: "Construction",
    activity: "build",
    professionSlug: "carpenter",
  },
  {
    id: "logistics",
    label: "Logistics",
    activity: "move",
    professionSlug: "driver",
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    activity: "make",
    professionSlug: "production_worker",
  },
  { id: "care", label: "Care", activity: "care", professionSlug: "caregiver" },
  {
    id: "hospitality",
    label: "Hospitality",
    activity: "serve",
    professionSlug: "cook",
  },
  {
    id: "agriculture",
    label: "Agriculture",
    activity: "grow",
    professionSlug: "farm_worker",
  },
  {
    id: "technology",
    label: "Technology",
    activity: "create",
    professionSlug: "software_developer",
  },
  {
    id: "services",
    label: "Services",
    activity: "support",
    professionSlug: "cleaner",
  },
] as const satisfies readonly {
  id: LivingMarketSectorId;
  label: string;
  activity: string;
  professionSlug: string;
}[];

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

/**
 * One bounded public projection for living-market surfaces.
 *
 * Counts and titles are read from the existing anonymous-safe RPC layer.
 * Worker rows and vacancy coordinates are deliberately not available here.
 */
export async function readLivingMarketPublicSnapshot(): Promise<LivingMarketPublicSnapshot> {
  const [supplyResult, ...sectorResults] = await Promise.all([
    readWithOneRetry(() => readPublicVacancySupplyCounts()),
    ...SECTORS.map((sector) =>
      readWithOneRetry(() =>
        searchPublicVacancyPreviews({
          professionSlug: sector.professionSlug,
          page: 1,
        }),
      ),
    ),
  ]);

  const supply =
    supplyResult?.status === "ok"
      ? {
          activeVacancies: supplyResult.activeVacancies,
          distinctEmployers: supplyResult.distinctEmployers,
          lastRefreshedAt: supplyResult.lastRefreshedAt,
          basis: "live" as const,
        }
      : {
          activeVacancies: SWEDEN_COVERAGE_CURRENT.activeVacanciesFloor,
          distinctEmployers: SWEDEN_COVERAGE_CURRENT.identifiedEmployersFloor,
          lastRefreshedAt: null,
          basis: "measured-floor" as const,
        };

  return {
    ...supply,
    regions: SWEDEN_COVERAGE_CURRENT.regions,
    sectors: SECTORS.map((sector, index) => {
      const result = sectorResults[index];
      return {
        ...sector,
        totalCount: result?.status === "ok" ? result.totalCount : null,
        jobs:
          result?.status === "ok"
            ? result.vacancies.slice(0, 3).map((vacancy) => ({
                id: vacancy.id,
                title: vacancy.title,
                professionSlug: vacancy.professionSlug,
                occupation: vacancy.occupation,
              }))
            : [],
        basis: result?.status === "ok" ? "live" : "unavailable",
      } satisfies LivingMarketSector;
    }),
  };
}
