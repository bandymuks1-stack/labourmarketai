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

export const PUBLIC_VACANCY_PAGE_SIZE = 20;
/** Mirrors the hard cap inside the SQL function. */
export const PUBLIC_VACANCY_MAX_LIMIT = 50;

export type PublicVacancyPreviewStatus = "ok" | "not_provisioned";

/**
 * Exactly the fields an anonymous caller may receive. There is intentionally no
 * employerName, country, region, city, lat, lng, applicationUrl or description:
 * those are member-only and the SQL function never returns them.
 */
export interface PublicVacancyPreview {
  readonly id: string;
  readonly title: string;
  readonly professionSlug: string | null;
  readonly occupation: string | null;
  readonly employmentForm: string | null;
  readonly workingTime: string | null;
  readonly positions: number | null;
  readonly compensationCurrency: string | null;
  readonly compensationMin: number | null;
  readonly compensationMax: number | null;
  readonly sourceLanguage: string | null;
  /** i18n key for the source's licence attribution. Rendering it is a licence obligation. */
  readonly attributionCode: string | null;
  readonly publishedAt: string | null;
}

export interface PublicVacancySearchResult {
  readonly status: PublicVacancyPreviewStatus;
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
    title: row.title_raw ?? "",
    professionSlug: row.profession_slug,
    occupation: row.occupation_raw,
    employmentForm: row.employment_form,
    workingTime: row.working_time,
    positions: row.positions,
    compensationCurrency: row.compensation_currency,
    compensationMin: toNumber(row.compensation_min),
    compensationMax: toNumber(row.compensation_max),
    sourceLanguage: row.source_language,
    attributionCode: row.attribution_code,
    publishedAt: row.published_at,
  };
}

export async function searchPublicVacancyPreviews(input: {
  query?: string | null;
  professionSlug?: string | null;
  page?: number;
}): Promise<PublicVacancySearchResult> {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const limit = PUBLIC_VACANCY_PAGE_SIZE;
  const offset = (page - 1) * limit;

  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(
    "search_public_vacancy_previews_v1",
    {
      p_query: input.query?.trim() || null,
      p_profession_slug: input.professionSlug?.trim() || null,
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
export async function readPublicVacancySupplyCounts(): Promise<PublicVacancySupplyCounts> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("count_public_vacancies_v1");

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
