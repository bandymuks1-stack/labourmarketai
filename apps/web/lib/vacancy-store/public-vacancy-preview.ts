import "server-only";

/**
 * PUBLIC VACANCY PREVIEW — the anonymous read path.
 *
 * This is deliberately NOT `vacancy-read.ts`. That module selects `*` from
 * `public_vacancies` and is correct for a MEMBER, who is allowed the whole ad.
 * An anonymous visitor is not, so the two paths are separate by construction:
 *
 *   anonymous → search_public_vacancy_previews_v1 / get_public_vacancy_preview_v1
 *   member    → vacancy-read.ts (select *)
 *
 * The restriction lives in the DATABASE, not here. Those functions enumerate the
 * safe columns in their RETURNS TABLE clause and the `public_vacancies` grant to
 * `anon` does not exist — proven in production 2026-08-18: a direct anon read
 * fails with `42501 permission denied for table public_vacancies`.
 *
 * That matters more than it looks. Because the projection is enforced one layer
 * below this file, a future component cannot accidentally widen it by selecting
 * another column, and a restricted field cannot leak through RSC payloads,
 * JSON-LD, OpenGraph, the sitemap or an error response. Widening the public
 * surface requires a migration — a deliberate act with a review.
 *
 * NOT_PROVISIONED is preserved as a first-class outcome, matching the sibling
 * member path: "the feature is not switched on" and "there are no jobs" are
 * opposite statements and must not render the same screen.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * These three functions were applied to production on 2026-08-18 but are not in
 * the checked-in generated types yet, so `rpc()` cannot name them. Same idiom as
 * the sibling timesheets/lifecycle modules.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** PostgreSQL undefined_function / PostgREST unknown-RPC. */
const UNDEFINED_FUNCTION = "42883";
const POSTGREST_UNKNOWN_RPC = "PGRST202";
/**
 * PostgreSQL query_canceled — the `anon` role's 3 s statement_timeout fired.
 *
 * THE CAUSE IS FIXED. `search_public_vacancy_previews_v1` computed its
 * `total_count` with `count(*) over ()`, walking every live row on every call.
 * Production logs for the 24 h to 2026-09-08 carried 1,595 `canceling
 * statement due to statement timeout` lines and EVERY ONE of them was
 * `SQL function "search_public_vacancy_previews_v1" statement 1`, from
 * `postgrest`/`authenticator` — real anonymous traffic, ~66/hour. The board
 * answered HTTP 500 because this module re-threw into the page. The body was
 * replaced on 2026-09-08 (ledger 20260908110702); the last organic timeout was
 * 10:49:51, seventeen minutes before the apply, and the unfiltered read now
 * measures 2.7 ms under the real `anon` role.
 *
 * THIS HANDLER STAYS ANYWAY, and that is the point. A statement timeout is
 * always possible — a slower filter, a colder cache, a bigger table next year.
 * What must never happen again is the SHAPE of the failure: a read that did not
 * answer became either a 500 or, worse, "0 vacancies found". Those are three
 * different facts and the product owes the person the true one. `unavailable`
 * is a named state distinct from `not provisioned` and from an empty result —
 * unknown is not zero.
 */
const QUERY_CANCELED = "57014";

export const PUBLIC_VACANCY_PAGE_SIZE = 20;
/** Mirrors the hard cap inside the SQL function. */
export const PUBLIC_VACANCY_MAX_LIMIT = 50;

export type PublicVacancyPreviewStatus = "ok" | "not_provisioned";

/**
 * Exactly the fields an anonymous caller may receive. There is intentionally no
 * employerName, country, region, city, lat, lng, applicationUrl or description:
 * those are member-only and the SQL function never returns them. Since
 * 20260824120000_public_vacancy_anon_boundary_v2 the raw title and the named
 * source attribution are withheld too (both NULL): titles embed employer and
 * location wording, and the named source identifies the country.
 */
export interface PublicVacancyPreview {
  readonly id: string;
  /** ALWAYS NULL on the anonymous path since 2026-08-24: the publisher's
   *  free-text title routinely embeds the employer name and the workplace
   *  location ("Väktare till Lunds Universitet"), so the SQL functions return
   *  NULL here for anonymous callers. The member read path
   *  (`vacancy-read.ts`) still supplies the real title. */
  readonly title: string | null;
  readonly professionSlug: string | null;
  readonly occupation: string | null;
  readonly employmentForm: string | null;
  readonly workingTime: string | null;
  readonly positions: number | null;
  readonly compensationCurrency: string | null;
  readonly compensationMin: number | null;
  readonly compensationMax: number | null;
  readonly sourceLanguage: string | null;
  /** ALWAYS NULL on the anonymous path since 2026-08-24: the named source is
   *  a national employment service and therefore identifies the country. The
   *  UI renders a generic source line anonymously; members receive the full
   *  named attribution via their own read path. */
  readonly attributionCode: string | null;
  readonly publishedAt: string | null;
}

export interface PublicVacancySearchResult {
  /** `unavailable`: the read did not answer in time (statement timeout) —
   *  distinct from "not switched on" and from "no jobs". */
  readonly status: PublicVacancyPreviewStatus | "unavailable";
  readonly vacancies: readonly PublicVacancyPreview[];
  readonly totalCount: number;
  readonly hasMore: boolean;
}

export interface PublicVacancySupplyCounts {
  readonly status: PublicVacancyPreviewStatus;
  readonly activeVacancies: number;
  readonly distinctEmployers: number;
  readonly lastRefreshedAt: string | null;
}

interface PreviewRow {
  id: string;
  title_raw: string | null;
  profession_slug: string | null;
  occupation_raw: string | null;
  employment_form: string | null;
  working_time: string | null;
  positions: number | null;
  compensation_currency: string | null;
  compensation_min: number | string | null;
  compensation_max: number | string | null;
  source_language: string | null;
  attribution_code: string | null;
  published_at: string | null;
  total_count?: number | string | null;
}

function isNotProvisioned(code: string | undefined): boolean {
  return code === UNDEFINED_FUNCTION || code === POSTGREST_UNKNOWN_RPC;
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toPreview(row: PreviewRow): PublicVacancyPreview {
  return {
    id: row.id,
    // Defense-in-depth for the anonymous boundary (owner directive
    // 2026-08-24): even if the SQL projection ever regressed and returned the
    // raw title or the named attribution again, this module — the ONLY
    // anonymous read path — drops them before they can reach a component,
    // an RSC payload or generated metadata.
    title: null,
    professionSlug: row.profession_slug,
    occupation: row.occupation_raw,
    employmentForm: row.employment_form,
    workingTime: row.working_time,
    positions: row.positions,
    compensationCurrency: row.compensation_currency,
    compensationMin: toNumber(row.compensation_min),
    compensationMax: toNumber(row.compensation_max),
    sourceLanguage: row.source_language,
    attributionCode: null,
    publishedAt: row.published_at,
  };
}

/**
 * IDENTICAL ANONYMOUS READS ARE ANSWERED ONCE — the thundering-herd fix.
 *
 * ── WHAT PRODUCTION ACTUALLY DOES (measured 2026-09-08) ────────────────────
 * Every call to this RPC arrives with `user_agent = "node"`: it is the Next.js
 * server rendering `/jobs`, never a browser. `/jobs` is `force-dynamic` and
 * calls this exactly once per render, so N concurrent renders are N database
 * queries.
 *
 * The failures are not slow queries. Ten DISTINCT postgres sessions timed out
 * within 135 ms of each other, and the SAME ten timed out again 3.03 s later —
 * which is why every timeout count in the logs is an exact multiple of 10 or
 * 20, never 3, 7 or 13. At 12:42 the edge log carried 60 HTTP requests to this
 * one RPC in a single minute (40 × 200, 20 × 500), so the second wave is a new
 * batch of HTTP requests, not an internal retry. Measured individually the same
 * calls take 1–144 ms; ten at once against a 377 MB table exceed the `anon`
 * role's 3 s statement_timeout together.
 *
 * ── WHY THE CACHE LIVES HERE AND NOT ON THE PAGE ───────────────────────────
 * `/jobs` renders SESSION-DEPENDENT content — it reads `hasSessionCookie` and a
 * worker's PRIVATE saved-bookmark list — and `/jobs/[id]` is `force-dynamic`
 * for exactly this reason, written down there: a member's full ad must never be
 * replayed to an anonymous visitor from a shared cache. So page/ISR/CDN caching
 * is NOT available and is not attempted.
 *
 * What IS shareable is this RPC's RESULT. `search_public_vacancy_previews_v1`
 * consults no `auth.uid()`, no `auth.jwt()` and no `current_setting` — verified
 * against the live function — so its output depends ONLY on its four
 * parameters. Two callers passing the same parameters are entitled to
 * byte-identical bytes, whoever they are. That is the whole justification, and
 * it is why the key below is the parameter tuple and nothing else.
 *
 * ── THREE MECHANISMS, EACH BOUNDED ─────────────────────────────────────────
 *   COALESCE   concurrent identical calls share ONE in-flight promise, so a
 *              burst of ten renders becomes one query.
 *   CACHE      a successful result is reused for FRESH_MS. Only `ok` is cached:
 *              `not_provisioned` is an environment fact and `unavailable` is a
 *              failure, and neither may be served as though it were data.
 *   COOLDOWN   after a timeout the next identical call is answered `unavailable`
 *              for COOLDOWN_MS instead of re-issuing. This module adds no
 *              retries of its own; the cooldown exists so somebody else's retry
 *              wave cannot re-hammer a database that just failed.
 *
 * FRESH_MS is deliberately far shorter than the staleness this endpoint already
 * accepts: `total_count` comes from a cron singleton refreshed every 10 minutes
 * and may already be that old by design. Nothing here makes a freshness claim
 * to a person, so no "stale" badge is owed at this scale.
 */
const FRESH_MS = 30_000;
const COOLDOWN_MS = 3_000;
/** Bounded so a crawler walking pages cannot grow this without limit. */
const MAX_ENTRIES = 64;

type CacheEntry =
  | { readonly kind: "fresh"; readonly at: number; readonly value: PublicVacancySearchResult }
  | { readonly kind: "cooldown"; readonly at: number };

const resultCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<PublicVacancySearchResult>>();

/** The parameter tuple, and ONLY the parameter tuple. Anything caller-specific
 *  appearing in this key would mean the cached value is not shareable. */
function cacheKey(query: string | null, professionSlug: string | null, offset: number): string {
  return JSON.stringify([query, professionSlug, offset, PUBLIC_VACANCY_PAGE_SIZE]);
}

function remember(key: string, entry: CacheEntry): void {
  if (resultCache.size >= MAX_ENTRIES) {
    const oldest = resultCache.keys().next();
    if (!oldest.done) resultCache.delete(oldest.value);
  }
  resultCache.set(key, entry);
}

/** Exported for the guard and for tests: a fresh process must behave like a
 *  fresh process, and a test must not inherit another test's cache. */
export function __resetPublicVacancyCache(): void {
  resultCache.clear();
  inFlight.clear();
}

export async function searchPublicVacancyPreviews(
  input: {
    query?: string | null;
    professionSlug?: string | null;
    page?: number;
  },
  suppliedClient?: SupabaseClient,
): Promise<PublicVacancySearchResult> {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const limit = PUBLIC_VACANCY_PAGE_SIZE;
  const offset = (page - 1) * limit;
  const queryParam = input.query?.trim() || null;
  const slugParam = input.professionSlug?.trim() || null;
  const key = cacheKey(queryParam, slugParam, offset);
  const now = Date.now();

  const cached = resultCache.get(key);
  if (cached) {
    if (cached.kind === "fresh" && now - cached.at < FRESH_MS) return cached.value;
    if (cached.kind === "cooldown" && now - cached.at < COOLDOWN_MS) {
      // Somebody's retry arriving inside the cooldown. Answer honestly rather
      // than re-issuing into a database that just failed this exact query.
      return { status: "unavailable", vacancies: [], totalCount: 0, hasMore: false };
    }
    resultCache.delete(key);
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const run = (async (): Promise<PublicVacancySearchResult> => {
    const result = await runSearch({ queryParam, slugParam, limit, offset }, suppliedClient);
    if (result.status === "ok") remember(key, { kind: "fresh", at: Date.now(), value: result });
    else if (result.status === "unavailable") remember(key, { kind: "cooldown", at: Date.now() });
    return result;
  })();

  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
  }
}

async function runSearch(
  params: {
    queryParam: string | null;
    slugParam: string | null;
    limit: number;
    offset: number;
  },
  suppliedClient?: SupabaseClient,
): Promise<PublicVacancySearchResult> {
  const { queryParam, slugParam, limit, offset } = params;

  const supabase = suppliedClient ?? (await createClient());
  const { data, error } = await asAny(supabase).rpc(
    "search_public_vacancy_previews_v1",
    {
      p_query: queryParam,
      p_profession_slug: slugParam,
      p_limit: limit,
      p_offset: offset,
    },
  );

  if (error) {
    if (isNotProvisioned(error.code)) {
      return {
        status: "not_provisioned",
        vacancies: [],
        totalCount: 0,
        hasMore: false,
      };
    }
    if (error.code === QUERY_CANCELED) {
      return {
        status: "unavailable",
        vacancies: [],
        totalCount: 0,
        hasMore: false,
      };
    }
    throw error;
  }

  const rows = (data ?? []) as PreviewRow[];
  const totalCount = toNumber(rows[0]?.total_count ?? null) ?? 0;

  return {
    status: "ok",
    vacancies: rows.map(toPreview),
    totalCount,
    hasMore: offset + rows.length < totalCount,
  };
}

export async function getPublicVacancyPreview(
  id: string,
): Promise<PublicVacancyPreview | null | "not_provisioned"> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("get_public_vacancy_preview_v1", {
    p_id: id,
  });

  if (error) {
    if (isNotProvisioned(error.code)) return "not_provisioned";
    // An invalid uuid is a bad URL, not a server fault.
    if (error.code === "22P02") return null;
    throw error;
  }

  const rows = (data ?? []) as PreviewRow[];
  const row = rows[0];
  return row ? toPreview(row) : null;
}

/**
 * Live governed supply counts. Replaces the pinned landing constant: a number
 * a visitor reads should be the number the database currently holds.
 */
export async function readPublicVacancySupplyCounts(
  suppliedClient?: SupabaseClient,
): Promise<PublicVacancySupplyCounts> {
  const supabase = suppliedClient ?? (await createClient());
  const { data, error } = await asAny(supabase).rpc(
    "count_public_vacancies_v1",
  );

  if (error) {
    if (isNotProvisioned(error.code)) {
      return {
        status: "not_provisioned",
        activeVacancies: 0,
        distinctEmployers: 0,
        lastRefreshedAt: null,
      };
    }
    throw error;
  }

  const row = (data ?? [])[0] as
    | {
        active_vacancies: number | string | null;
        distinct_employers: number | string | null;
        last_refreshed_at: string | null;
      }
    | undefined;

  return {
    status: "ok",
    activeVacancies: toNumber(row?.active_vacancies ?? null) ?? 0,
    distinctEmployers: toNumber(row?.distinct_employers ?? null) ?? 0,
    lastRefreshedAt: row?.last_refreshed_at ?? null,
  };
}

/**
 * SITEMAP PROJECTION — the crawler-discovery path.
 *
 * Deliberately separate from the two preview readers above, and narrower than
 * both: a sitemap may contain a URL and a date, so this returns exactly `id`
 * and `lastModified` and nothing else. `lastModified` is the publisher's own
 * `published_at`, never an ingestion timestamp — `updated_at` / `last_seen_at`
 * move when the importer re-reads an ad, so publishing either as <lastmod>
 * would claim 39k pages changed on six days when their content did not.
 */
export interface PublicVacancySitemapEntry {
  readonly id: string;
  /** ISO timestamp of the publisher's own publication date, or null. */
  readonly lastModified: string | null;
}

export interface PublicVacancySitemapPage {
  readonly status: PublicVacancyPreviewStatus;
  readonly entries: readonly PublicVacancySitemapEntry[];
}

/** Rows per sitemap shard. Well under the sitemaps.org 50,000-per-file ceiling. */
export const PUBLIC_VACANCY_SITEMAP_SHARD_SIZE = 5000;

export async function listPublicVacancySitemapEntries(input: {
  shard: number;
}): Promise<PublicVacancySitemapPage> {
  const shard = Math.max(0, Math.floor(input.shard));
  const limit = PUBLIC_VACANCY_SITEMAP_SHARD_SIZE;
  const offset = shard * limit;

  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(
    "list_public_vacancy_sitemap_v1",
    { p_limit: limit, p_offset: offset },
  );

  if (error) {
    // A missing function means the feature is not switched on. The route then
    // emits a valid EMPTY sitemap rather than a 500 — a crawler must never be
    // served an error page at a sitemap URL.
    if (isNotProvisioned(error.code)) return { status: "not_provisioned", entries: [] };
    throw error;
  }

  const rows = (data ?? []) as { id: string; last_modified: string | null }[];
  return {
    status: "ok",
    entries: rows.map((r) => ({ id: r.id, lastModified: r.last_modified })),
  };
}
