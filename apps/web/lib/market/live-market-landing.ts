import "server-only";

import { unstable_cache } from "next/cache";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { requireSupabaseClientEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";
import {
  readPublicVacancySupplyCounts,
  searchPublicVacancyPreviews,
  type PublicVacancyPreview,
} from "@/lib/vacancy-store/public-vacancy-preview";

export type LiveMarketJob = {
  readonly id: string;
  /** The source OCCUPATION label, not the raw ad title: the anonymous
   *  projection withholds titles because they embed employer and location
   *  wording (owner anonymous-boundary directive). */
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
  /** A few REAL, CURRENT vacancies for the public landing (owner directive
   *  PUBLIC_LANDING_REAL_JOB_DISCOVERY) — see `readVacancySample` below. */
  readonly sample: LiveMarketVacancySample;
};

/**
 * THE LANDING'S REAL-JOB SAMPLE — the same rows `/jobs` page 1 shows.
 *
 * Owner directive (PUBLIC_LANDING_REAL_JOB_DISCOVERY): expose a bounded
 * section of real, current vacancies by REUSING the canonical public jobs
 * query and card — never a second jobs implementation, and never a gated
 * field. So this is exactly one call to the ONE anonymous reader,
 * `searchPublicVacancyPreviews({ page: 1 })` — unfiltered, the same parameter
 * tuple the board's first page asks, so the two share that reader's
 * coalescing and result cache — and the rows are its `PublicVacancyPreview`
 * projection untouched: no employer, no place, no raw title, no named
 * source, because the database function never returns them and `toPreview`
 * drops the last two again before any component sees a row.
 *
 * `unavailable` covers "the read did not answer" AND "not switched on"; the
 * landing omits the band for both, and for an empty `live` page too. Unknown
 * is never rendered as "no jobs".
 */
export type LiveMarketVacancySample = {
  readonly basis: "live" | "unavailable";
  readonly vacancies: readonly PublicVacancyPreview[];
};

/** How many real vacancies the landing shows. A glimpse, not a board: the
 *  whole board is one link away. */
export const LANDING_VACANCY_SAMPLE_SIZE = 4;

const UNAVAILABLE_SAMPLE: LiveMarketVacancySample = {
  basis: "unavailable",
  vacancies: [],
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

/**
 * ── WHY THIS READS ONE PROFESSION AT A TIME, AND WHY IT STOPS ─────────────
 *
 * Measured on production; the dated evidence and the failing-before proof are
 * pinned in `lib/guards/landing-fanout-is-sequential.test.ts` (this file may
 * carry no bare four-digit literal, so the date lives there — see the
 * hardcoded-total guard in `verified-market-data-live.test.ts`).
 *
 * This module was the SOURCE of the public vacancy RPC timeouts, and the
 * shape of the evidence names it exactly: the
 * postgres log carries `canceling statement due to statement timeout` in
 * groups of EXACTLY TEN inside a single second (14:58:41, 15:07:04), and ten
 * is the length of the list above. One landing render issued all ten
 * profession reads through `Promise.all`, so a single render was ten
 * concurrent anonymous statements against a 377 MB table.
 *
 * They are ten DIFFERENT queries — one per slug — so the RPC-result
 * coalescing added for the same symptom cannot merge them, and must not: its
 * key is the parameter tuple, and two different professions are not the same
 * question. The fan-out had to be removed where it is CREATED, which is here.
 *
 * The per-call cost is not small when the table is cold. Warm, the ten total
 * 947 ms (47–452 ms each). On a cold buffer cache a single profession read
 * measured 2.5 s, and one measured 9.8 s. `farm_worker` is the worst case for
 * a structural reason: it has no active vacancies at all, so its `LIMIT` can
 * never be satisfied early and it scans to the end — 6.6 s, returning zero
 * rows. Ten of those at once is what exceeded the `anon` role's 3 s
 * statement_timeout together.
 *
 * A budget is not a timeout. An abandoned statement keeps running inside
 * postgres, so racing one would HIDE the work rather than remove it. This
 * declines to START further reads once the snapshot has spent its budget,
 * which genuinely does less. A profession that was not read carries
 * `basis: "unavailable"` — never a substituted zero, which would claim there
 * are no such jobs.
 */
const PROFESSION_READ_BUDGET_MS = 6_000;

async function readOrNull<T>(reader: () => Promise<T>): Promise<T | null> {
  try {
    return await reader();
  } catch {
    // No retry. A statement timeout no longer throws — the public reader
    // returns an honest `unavailable` — so a throw here is an UNRECOGNISED
    // failure, and immediately repeating it would only add load to a database
    // that has just failed. The previous one-shot retry doubled every wave.
    return null;
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
    sample: UNAVAILABLE_SAMPLE,
  };
}

/**
 * The first few rows of the board's own first page, in the board's own
 * order — SELECTED, never re-ranked by a score and never filtered by a
 * profession.
 *
 * Two preferences, both about the reader rather than the market:
 *   · a row with a canonical `professionSlug` heads the card in the
 *     VISITOR'S language (the anonymous title is withheld, so the heading is
 *     the profession name), while a row without one can only head with the
 *     publisher's occupation words — so slugged rows come first;
 *   · a row with neither a slug nor an occupation has nothing honest to head
 *     with (the card would print a dash), so it is not chosen at all.
 * The relative order inside each group is the RPC's, unchanged.
 */
export function pickLandingVacancySample(
  vacancies: readonly PublicVacancyPreview[],
): PublicVacancyPreview[] {
  const withSlug = vacancies.filter((v) => v.professionSlug);
  const occupationOnly = vacancies.filter(
    (v) => !v.professionSlug && v.occupation,
  );
  return [...withSlug, ...occupationOnly].slice(0, LANDING_VACANCY_SAMPLE_SIZE);
}

async function readVacancySample(
  publicClient: SupabaseClient,
): Promise<LiveMarketVacancySample> {
  // ONE unfiltered read — never `professionSlug`: a filtered read of a
  // profession with few live ads scans to the end of the table cold, which
  // is the timeout class documented above. `page: 1` with no filter is the
  // cheapest statement the public contract has.
  const result = await readOrNull(() =>
    searchPublicVacancyPreviews({ page: 1 }, publicClient),
  );
  if (result?.status !== "ok") return UNAVAILABLE_SAMPLE;
  return {
    basis: "live",
    vacancies: pickLandingVacancySample(result.vacancies),
  };
}

/**
 * The one anonymous-safe projection for the live-map owner review.
 *
 * It intentionally carries no vacancy coordinates, employer identities or
 * worker rows. The current public SQL contract does not expose those values,
 * so the map may truthfully resolve supply to Sweden but not invent a city or
 * region distribution inside Sweden. The vacancy `sample` is that same public
 * contract's preview rows, so it carries none of them either.
 */
export async function readFreshLiveMarketLandingSnapshot(
  /** Injected only by the concurrency guard, which has to observe how many
   *  statements this snapshot puts in flight at once. Production passes
   *  nothing and gets the anonymous client built below. */
  suppliedClient?: SupabaseClient,
  /** See `resolveProfessions` on the exported reader. */
  resolveProfessions: boolean = true,
): Promise<LiveMarketLandingSnapshot> {
  let publicClient: SupabaseClient;
  if (suppliedClient) {
    publicClient = suppliedClient;
  } else {
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
    publicClient = createSupabaseClient<Database>(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }

  const supplyResult = await readOrNull(() =>
    readPublicVacancySupplyCounts(publicClient),
  );

  // Sequential, like every read here: the counts, then the one unfiltered
  // sample page, then (LIVE only) the professions. It runs BEFORE the
  // profession budget starts, so it can never cost LIVE a profession read.
  // LIVE does not render it today; it is one cached statement per freshness
  // window, and a second mode flag would only fork the snapshot's shape.
  const sample = await readVacancySample(publicClient);

  const startedAt = Date.now();
  const professionResults: (Awaited<
    ReturnType<typeof searchPublicVacancyPreviews>
  > | null)[] = [];
  for (const slug of resolveProfessions ? PROFESSION_FILTER_SLUGS : []) {
    if (Date.now() - startedAt >= PROFESSION_READ_BUDGET_MS) {
      professionResults.push(null);
      continue;
    }
    // Sequential on purpose: see PROFESSION_READ_BUDGET_MS above. One
    // anonymous statement at a time from this path, never ten.
    professionResults.push(
      await readOrNull(() =>
        searchPublicVacancyPreviews(
          { professionSlug: slug, page: 1 },
          publicClient,
        ),
      ),
    );
  }

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
    sample,
  };
}

/**
 * The public supply changes daily, not second-by-second. A five-minute shared
 * cache keeps the command view current without putting the anonymous RPCs in
 * front of every visitor's first paint. The next request after expiry refreshes
 * the bounded anonymous snapshot; no user/session state enters this cache.
 *
 * `unstable_cache` keys on the arguments as well as the key parts, so the two
 * modes below occupy two entries and never serve each other's result.
 *
 * The key part is VERSIONED BY SHAPE. Next derives the entry key from this
 * callback's source text plus the key parts, and the callback did not change
 * when the snapshot gained `sample` — so under the old key a data-cache entry
 * written before a deploy would be served to code that reads `sample` and
 * finds nothing. A new shape gets a new key.
 */
const readCachedSnapshot = unstable_cache(
  (resolveProfessions: boolean) =>
    readFreshLiveMarketLandingSnapshot(undefined, resolveProfessions),
  ["live-market-landing-v2"],
  { revalidate: 300 },
);

/**
 * ── WHY THE DEFAULT LANDING ASKS FOR LESS ─────────────────────────────────
 *
 * Every consumer of this snapshot was enumerated. `/` (FOCUS) reads the three
 * supply fields — `activeVacancies`, `distinctEmployers`, `lastRefreshedAt` —
 * through `focus-landing.tsx` and `market-proof-band.tsx`, plus the unfiltered
 * `sample` through `landing-open-jobs-band.tsx`, and reads `professions`
 * NOWHERE. The profession chips that band renders come from its
 * own static `TOP_PROFESSION_FAMILY_SLUGS` list, which is a different set from
 * `PROFESSION_FILTER_SLUGS` above and is not derived from live data at all.
 *
 * The only consumers of `professions` are the two `/live-market-review` files,
 * which render a per-profession count and one sample vacancy.
 *
 * So the profession reads were work the default landing paid for and never
 * used. `resolveProfessions: false` declines to issue them. This is ONE
 * reader, not two: both surfaces resolve the same supply counts through the
 * same function and the same freshness window, so the two presentations can
 * never drift into showing different market numbers.
 *
 * An unresolved profession stays `unavailable` with a `null` count. It is not
 * zero and must never become zero: "we did not ask" is not "there are none".
 */
export function readLiveMarketLandingSnapshot(options?: {
  /** Default `true`. `false` skips the per-profession reads entirely. */
  readonly resolveProfessions?: boolean;
}): Promise<LiveMarketLandingSnapshot> {
  return readCachedSnapshot(options?.resolveProfessions ?? true);
}
