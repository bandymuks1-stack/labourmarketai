import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { requireSupabaseClientEnv } from "@/lib/env";
import {
  PUBLIC_VACANCY_SITEMAP_SHARD_SIZE,
  listPublicVacancySitemapAfter,
  listPublicVacancySitemapEntries,
  readPublicVacancySupplyCounts,
  type PublicVacancySitemapCursor,
  type PublicVacancySitemapEntry,
  type PublicVacancySitemapPage,
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
 *   5. KEYSET paging once `list_public_vacancy_sitemap_after_v1` is applied:
 *      the cursor walk records where each shard starts, and a shard is one
 *      ~19 ms seek. While the function is absent, OFFSET (v1) as before.
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

/** Upper bound on the cursor walk (500 shards = 500k ads), a bound, not a goal. */
const MAX_SHARDS = 500;

export type SitemapCursors =
  /** Keyset function applied: `starts[n]` is where shard n begins (null = first). */
  | { readonly mode: "keyset"; readonly starts: readonly (PublicVacancySitemapCursor | null)[] }
  /** Keyset function absent (not applied / rolled back): page by OFFSET (v1). */
  | { readonly mode: "offset" };

type AfterReader = (after: PublicVacancySitemapCursor | null) => Promise<PublicVacancySitemapPage>;

/**
 * Walk the sitemap once by keyset and record where each shard starts. Every
 * step is a short index seek (~19 ms in production), so ~54 steps stay far
 * inside any timeout. Exported for the unit test; the routes use the cached
 * wrapper below.
 */
export async function walkSitemapCursors(read: AfterReader): Promise<SitemapCursors> {
  const starts: (PublicVacancySitemapCursor | null)[] = [];
  let next: PublicVacancySitemapCursor | null = null;
  for (let i = 0; i < MAX_SHARDS; i++) {
    const page = await withTimeoutRetry(() => read(next));
    if (page.status === "not_provisioned") return { mode: "offset" };
    if (page.entries.length === 0) break;
    starts.push(next);
    if (page.entries.length < PUBLIC_VACANCY_SITEMAP_SHARD_SIZE) break;
    const last = page.entries[page.entries.length - 1];
    // published_at is NOT NULL on the table; a missing date means the
    // projection changed under us — page by OFFSET rather than guess.
    if (!last.lastModified) return { mode: "offset" };
    next = { publishedAt: last.lastModified, id: last.id };
  }
  return { mode: "keyset", starts };
}

export const readCachedSitemapCursors = unstable_cache(
  (): Promise<SitemapCursors> =>
    serialized(() => walkSitemapCursors((after) => listPublicVacancySitemapAfter(after, anonClient()))),
  ["jobs-sitemap-cursors-v1"],
  { revalidate: TTL_SECONDS, tags: ["jobs-sitemap"] },
);

export const readCachedSitemapShard = unstable_cache(
  async (shard: number): Promise<CachedSitemapShard> => {
    // Read OUTSIDE `serialized`: the cursor walk queues itself, and a nested
    // queue entry would wait on its own parent.
    const cursors = await readCachedSitemapCursors();
    return serialized(() =>
      withTimeoutRetry(async () => {
        let page: PublicVacancySitemapPage;
        if (cursors.mode === "keyset") {
          if (shard >= cursors.starts.length) return { status: "ok" as const, entries: [] };
          page = await listPublicVacancySitemapAfter(cursors.starts[shard], anonClient());
          // Rolled back between the walk and this read: fall back to OFFSET.
          if (page.status === "not_provisioned") {
            page = await listPublicVacancySitemapEntries({ shard }, anonClient());
          }
        } else {
          page = await listPublicVacancySitemapEntries({ shard }, anonClient());
        }
        return page.status === "ok"
          ? { status: "ok" as const, entries: page.entries }
          : { status: "not_provisioned" as const };
      }),
    );
  },
  ["jobs-sitemap-shard-v2"],
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

/** How many shards the index lists: the walked keyset shards when the keyset
 *  function is applied, else ceil(live count / shard size) as before.
 *  null = the feature is off (an empty, valid index). */
export async function readCachedSitemapShardCount(): Promise<number | null> {
  const cursors = await readCachedSitemapCursors();
  if (cursors.mode === "keyset") return cursors.starts.length;
  const active = await readCachedActiveVacancyCount();
  return active === null ? null : Math.ceil(active / PUBLIC_VACANCY_SITEMAP_SHARD_SIZE);
}

/** Shared and edge caches may keep a sitemap an hour and serve it stale for a
 *  day while refreshing — a crawler never waits on the database. */
export const SITEMAP_CACHE_CONTROL = `public, max-age=${TTL_SECONDS}, s-maxage=${TTL_SECONDS}, stale-while-revalidate=86400`;
