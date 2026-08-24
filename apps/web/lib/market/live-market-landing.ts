import "server-only";

import { unstable_cache } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseClientEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";
import {
  readPublicVacancySupplyCounts,
  searchPublicVacancyPreviews,
} from "@/lib/vacancy-store/public-vacancy-preview";

export type LiveMarketJob = {
  readonly id: string;
  /** The source OCCUPATION label, not the raw ad title: the anonymous
   *  projection withholds titles because they embed employer and location
   *  wording (owner directive 2026-08-24). */
  readonly title: string;
};

export type LiveMarketProfession = {
  readonly slug: string;
  readonly totalCount: number | null;
  readonly jobs: readonly LiveMarketJob[];
  readonly basis: "live" | "unavailable";
};

/**
 * VERIFIED MARKET DATA carries only what the canonical public reader actually
 * returned. `null` means "the live count is unavailable right now", never a
 * substituted constant: a measured floor rendered under a "verified" heading
 * would present an old, rounded number as current truth. There is no `regions`
 * field, because the public vacancy contract exposes no region count — the
 * former value was a static coverage fact, not live data.
 */
export type LiveMarketLandingSnapshot = {
  readonly activeVacancies: number | null;
  readonly distinctEmployers: number | null;
  readonly lastRefreshedAt: string | null;
  readonly basis: "live" | "unavailable";
  readonly professions: readonly LiveMarketProfession[];
};

/**
 * A bounded set of canonical taxonomy slugs for the public landing filter.
 * The result is sorted by the current anonymous vacancy counts, so this list
 * is not a ranking and does not pin a statistic.
 */
const PROFESSION_FILTER_SLUGS = [
  "electrician",
  "caregiver",
  "driver",
  "cook",
  "production_worker",
  "software_developer",
  "warehouse_worker",
  "cleaner",
  "carpenter",
  "farm_worker",
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

function unavailableSnapshot(): LiveMarketLandingSnapshot {
  return {
    activeVacancies: null,
    distinctEmployers: null,
    lastRefreshedAt: null,
    basis: "unavailable",
    professions: PROFESSION_FILTER_SLUGS.map((slug) => ({
      slug,
      totalCount: null,
      jobs: [],
      basis: "unavailable",
    })),
  };
}

/**
 * The one anonymous-safe projection for the live-map owner review.
 *
 * It intentionally carries no vacancy coordinates, employer identities or
 * worker rows. The current public SQL contract does not expose those values,
 * so the map may truthfully resolve supply to Sweden but not invent a city or
 * region distribution inside Sweden.
 */
async function readFreshLiveMarketLandingSnapshot(): Promise<LiveMarketLandingSnapshot> {
  let publicEnv: ReturnType<typeof requireSupabaseClientEnv>;
  try {
    publicEnv = requireSupabaseClientEnv();
  } catch {
    // Local/CI prerenders may intentionally have no public Supabase env. The
    // panel then renders no counts at all; production with env continues
    // through the live readers below.
    return unavailableSnapshot();
  }
  const { url, anonKey } = publicEnv;
  const publicClient = createSupabaseClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const [supplyResult, ...professionResults] = await Promise.all([
    readWithOneRetry(() => readPublicVacancySupplyCounts(publicClient)),
    ...PROFESSION_FILTER_SLUGS.map((slug) =>
      readWithOneRetry(() =>
        searchPublicVacancyPreviews(
          { professionSlug: slug, page: 1 },
          publicClient,
        ),
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
          activeVacancies: null,
          distinctEmployers: null,
          lastRefreshedAt: null,
          basis: "unavailable" as const,
        };

  return {
    ...supply,
    professions: PROFESSION_FILTER_SLUGS.map((slug, index) => {
      const result = professionResults[index];
      return {
        slug,
        totalCount: result?.status === "ok" ? result.totalCount : null,
        jobs:
          result?.status === "ok"
            ? result.vacancies
                .slice(0, 3)
                .map((vacancy) => ({
                  id: vacancy.id,
                  // Anonymous boundary: title is NULL by design; the
                  // occupation label is the public-safe display line.
                  title: vacancy.occupation ?? "",
                }))
                .filter((job) => job.title.length > 0)
            : [],
        basis: result?.status === "ok" ? "live" : "unavailable",
      } satisfies LiveMarketProfession;
    }).sort((a, b) => (b.totalCount ?? -1) - (a.totalCount ?? -1)),
  };
}

/**
 * The public supply changes daily, not second-by-second. A five-minute shared
 * cache keeps the command view current without putting nine network RPCs in
 * front of every visitor's first paint. The next request after expiry refreshes
 * the bounded anonymous snapshot; no user/session state enters this cache.
 */
export const readLiveMarketLandingSnapshot = unstable_cache(
  readFreshLiveMarketLandingSnapshot,
  ["live-market-landing-v1"],
  { revalidate: 300 },
);
