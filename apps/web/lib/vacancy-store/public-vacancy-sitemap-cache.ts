import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { requireSupabaseClientEnv } from "@/lib/env";
import {
  listPublicVacancySitemapEntries,
  readPublicVacancySupplyCounts,
  type PublicVacancySitemapEntry,
} from "@/lib/vacancy-store/public-vacancy-preview";

/**
 * CACHED SITEMAP READS (P0, 2026-11-03).
 *
 * Production edge logs: 12 statement timeouts (HTTP 500) in
 * `list_public_vacancy_sitemap_v1` in one morning, 8 of them in the second a
 * crawler fetched every shard at once. Cause, measured read-only:
 *   - the shard routes read through the cookie client, which makes them
 *     DYNAMIC: `revalidate = 3600` never applied and every request ran SQL;
 *   - a deep shard is an OFFSET scan: offset 52,000 walks ~117k index entries
 *     (66k of them expired ads still flagged active) — 4.2 s, over anon's 3 s
 *     statement timeout. Shard 0 takes 3 ms.
 *
 * So, here:
 *   1. a COOKIE-LESS anon client (the sitemap is anonymous by definition; the
 *      projection is the same `anon`-granted function);
 *   2. `unstable_cache` per shard and for the index count, one hour — a crawler
 *      fetching all 54 shards reaches the database at most once per shard per
 *      hour, and a stale entry keeps serving while it refreshes;
 *   3. cache MISSES run ONE AT A TIME, so 54 parallel misses become 54 short
 *      sequential queries instead of 54 deep scans competing for the same CPU;
 *   4. one retry on a statement timeout (57014), as the board search does.
 * The deep-OFFSET cost itself needs a keyset function (RED, separate PR).
 */

const QUERY_CANCELED = "57014";
const TTL_SECONDS = 3600;

let anon: SupabaseClient | null = null;
function anonClient(): SupabaseClient {
  if (!anon) {
    // Throws when the client env is missing; the routes answer 503, never 500.
    const { url, anonKey } = requireSupabaseClientEnv();
    anon = createSupabaseClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anon;
}

let queue: Promise<unknown> = Promise.resolve();
/** Run `fn` after every miss already queued has settled (one at a time). */
export function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/** One retry on a statement timeout; any other error is thrown as is. */
export async function withTimeoutRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if ((e as { code?: string } | null)?.code !== QUERY_CANCELED) throw e;
    return fn();
  }
}

export type CachedSitemapShard =
  | { readonly status: "ok"; readonly entries: readonly PublicVacancySitemapEntry[] }
  | { readonly status: "not_provisioned" };

export const readCachedSitemapShard = unstable_cache(
  (shard: number): Promise<CachedSitemapShard> =>
    serialized(() =>
      withTimeoutRetry(async () => {
        const page = await listPublicVacancySitemapEntries({ shard }, anonClient());
        return page.status === "ok"
          ? { status: "ok" as const, entries: page.entries }
          : { status: "not_provisioned" as const };
      }),
    ),
  ["jobs-sitemap-shard-v1"],
  { revalidate: TTL_SECONDS, tags: ["jobs-sitemap"] },
);

export const readCachedActiveVacancyCount = unstable_cache(
  (): Promise<number | null> =>
    serialized(() =>
      withTimeoutRetry(async () => {
        const counts = await readPublicVacancySupplyCounts(anonClient());
        return counts.status === "ok" ? counts.activeVacancies : null;
      }),
    ),
  ["jobs-sitemap-count-v1"],
  { revalidate: TTL_SECONDS, tags: ["jobs-sitemap"] },
);

/** Shared and edge caches may keep a sitemap an hour and serve it stale for a
 *  day while refreshing — a crawler never waits on the database. */
export const SITEMAP_CACHE_CONTROL = `public, max-age=${TTL_SECONDS}, s-maxage=${TTL_SECONDS}, stale-while-revalidate=86400`;
