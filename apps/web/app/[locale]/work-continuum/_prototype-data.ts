import "server-only";

import { SWEDEN_COVERAGE_CURRENT } from "@/lib/analytics/market-coverage-claims";
import {
  readPublicVacancySupplyCounts,
  searchPublicVacancyPreviews,
} from "@/lib/vacancy-store/public-vacancy-preview";

export type LivingPrototypeJob = {
  readonly id: string;
  readonly title: string;
  readonly professionSlug: string | null;
  readonly occupation: string | null;
};

export type LivingPrototypeSector = {
  readonly id:
    | "construction"
    | "logistics"
    | "manufacturing"
    | "care"
    | "hospitality"
    | "agriculture"
    | "technology"
    | "services";
  readonly label: string;
  readonly activity: string;
  readonly professionSlug: string;
  readonly totalCount: number | null;
  readonly jobs: readonly LivingPrototypeJob[];
  readonly basis: "live" | "unavailable";
};

export type LivingPrototypeMarket = {
  readonly activeVacancies: number;
  readonly distinctEmployers: number;
  readonly regions: number;
  readonly lastRefreshedAt: string | null;
  readonly basis: "live" | "measured-floor";
  readonly sectors: readonly LivingPrototypeSector[];
};

const SECTORS = [
  {
    id: "construction",
    label: "Construction",
    activity: "Build",
    professionSlug: "carpenter",
  },
  {
    id: "logistics",
    label: "Logistics",
    activity: "Move",
    professionSlug: "driver",
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    activity: "Make",
    professionSlug: "production_worker",
  },
  {
    id: "care",
    label: "Care",
    activity: "Care",
    professionSlug: "caregiver",
  },
  {
    id: "hospitality",
    label: "Hospitality",
    activity: "Serve",
    professionSlug: "cook",
  },
  {
    id: "agriculture",
    label: "Agriculture",
    activity: "Grow",
    professionSlug: "farm_worker",
  },
  {
    id: "technology",
    label: "Technology",
    activity: "Create",
    professionSlug: "software_developer",
  },
  {
    id: "services",
    label: "Services",
    activity: "Support",
    professionSlug: "cleaner",
  },
] as const;

async function readWithOneRetry<T>(reader: () => Promise<T>): Promise<T | null> {
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

export async function readLivingPrototypeMarket(): Promise<LivingPrototypeMarket> {
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
            ? result.vacancies.slice(0, 2).map((vacancy) => ({
                id: vacancy.id,
                title: vacancy.title,
                professionSlug: vacancy.professionSlug,
                occupation: vacancy.occupation,
              }))
            : [],
        basis: result?.status === "ok" ? "live" : "unavailable",
      } satisfies LivingPrototypeSector;
    }),
  };
}
