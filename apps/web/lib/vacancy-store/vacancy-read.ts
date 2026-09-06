import "server-only";

/**
 * VACANCY READ LAYER — how a stored external ad reaches a screen.
 *
 * The write half of this store exists so an import has somewhere to land. This
 * is the other half: the query a job board runs, and the row-to-contract
 * conversion that lets the EXISTING presentation contract
 * (`lib/vacancy-sources/vacancy-presentation.ts`) render an imported vacancy
 * through the same card as a direct opportunity. That module has had zero
 * callers since it was written; this is its caller.
 *
 * ── THE STATE THAT MATTERS MOST: NOT PROVISIONED ───────────────────────────
 *
 * The persistence migration is owner-gated and ships UNAPPLIED, so in
 * production this table DOES NOT EXIST YET, and it will not exist for as long
 * as the owner takes to decide. A read layer that assumed otherwise would turn
 * the whole job board into a 500 the moment it shipped.
 *
 * So a missing table is a first-class, named outcome (`not_provisioned`) —
 * not an exception, and emphatically not silently coerced into "no results".
 * Those two states look identical in a database and mean opposite things to a
 * user: "we have no jobs for you" versus "this feature is not switched on
 * yet". Telling a worker the first when the second is true is exactly the
 * dishonest empty state this train is meant to eliminate.
 *
 * The same distinction is what lets this ship SAFELY AHEAD of the migration:
 * merged and deployed, the board renders an honest "not yet available"
 * surface; the moment the owner applies the migration and activates a source,
 * the same code starts returning real ads with no further deploy.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicVacancyPreview } from "./public-vacancy-preview";
import type {
  PublicVacancyV1,
  VacancyEmploymentForm,
  VacancyImportChannel,
  VacancyLifecycle,
  VacancyProviderKey,
  VacancyWorkingTime,
} from "@/lib/vacancy-sources/vacancy-contract";

type VacancyDbClient = Pick<SupabaseClient, "from">;

const VACANCY_TABLE = "public_vacancies";

/** PostgreSQL `undefined_table`. The one error that means "not switched on
 *  yet" rather than "something broke". */
const UNDEFINED_TABLE = "42P01";

/** Hard ceiling on one page of results. A board that can be asked for ten
 *  thousand rows is a denial-of-service surface with a search box. */
export const VACANCY_SEARCH_MAX_LIMIT = 50;

export interface VacancySearchFiltersV1 {
  /** ISO-3166 alpha-2. Absent = every country we hold. */
  readonly country?: string | null;
  /** Platform profession slug, as derived by the categorizer. */
  readonly professionSlug?: string | null;
  /** Free text, matched against the publisher's own words. */
  readonly query?: string | null;
  readonly limit?: number;
  readonly offset?: number;
  /**
   * The reader's clock, for expiry. A PARAMETER rather than `Date.now()` so a
   * test can prove the expiry rule instead of racing it.
   */
  readonly nowIso: string;
}

export type VacancySearchStatus =
  /** The table exists and the query ran. `vacancies` may still be empty. */
  | "ok"
  /**
   * The table does not exist. The owner-gated persistence migration has not
   * been applied. This is NOT an error and NOT an empty result set.
   */
  | "not_provisioned";

export interface VacancySearchResultV1 {
  readonly status: VacancySearchStatus;
  readonly vacancies: readonly PublicVacancyV1[];
  /** True when more rows exist past this page. */
  readonly hasMore: boolean;
}

/**
 * Search live external vacancies.
 *
 * Liveness is decided HERE, at read time, from two facts stored separately:
 * `is_active` (did the publisher withdraw it?) and `expires_at` (has its own
 * stated validity passed?). The importer deliberately does not fold expiry
 * into `is_active`, because whether a date has passed is a question about
 * *now* — baking the answer into a stored boolean makes the row wrong as soon
 * as the clock moves.
 */
export async function searchPublicVacancies(
  client: VacancyDbClient,
  filters: VacancySearchFiltersV1,
): Promise<VacancySearchResultV1> {
  const limit = Math.max(
    1,
    Math.min(VACANCY_SEARCH_MAX_LIMIT, filters.limit ?? 20),
  );
  const offset = Math.max(0, filters.offset ?? 0);

  let q = client
    .from(VACANCY_TABLE)
    .select("*")
    .eq("is_active", true)
    // An ad with no stated expiry never expires; one with a stated expiry is
    // live until it passes. `or` keeps both in a single predicate so the
    // partial index still applies.
    .or(`expires_at.is.null,expires_at.gt.${filters.nowIso}`);

  if (filters.country) {
    q = q.eq("country", filters.country.trim().toUpperCase());
  }
  if (filters.professionSlug) {
    q = q.eq("profession_slug", filters.professionSlug);
  }
  if (filters.query && filters.query.trim().length > 0) {
    // Matched against the PUBLISHER'S OWN WORDS. Searching a machine
    // translation we do not have would find nothing; searching the original
    // finds what is actually stored.
    const term = sanitizeSearchTerm(filters.query);
    if (term.length > 0) {
      q = q.or(`title_raw.ilike.%${term}%,description_raw.ilike.%${term}%`);
    }
  }

  // One row past the page so "is there more" is answered by evidence rather
  // than by a second count query.
  //
  // ORDER DIRECTION IS THE INDEX (production, 2026-09-06). The generic path
  // (no country, no profession) is served by
  // `public_vacancies_active_published_idx (published_at DESC NULLS LAST, id)
  // WHERE is_active`; a plain `DESC` means NULLS FIRST, which that index
  // cannot deliver, so the planner seq-scanned 47k rows and top-N sorted them:
  // measured 6,947 ms — mean 2.85 s over 897 calls, max 7.9 s against the
  // 8 s statement timeout, i.e. the worker board and every sentence that
  // reads it ("kas man trūksta?") were failing with 57014. With NULLS LAST
  // the same query walks the index: 2.8 ms. The country and profession
  // indexes are plain `published_at DESC`, so those paths keep the default.
  const genericPath = !filters.country && !filters.professionSlug;
  const { data, error } = await q
    .order("published_at", { ascending: false, nullsFirst: !genericPath })
    .range(offset, offset + limit);

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return { status: "not_provisioned", vacancies: [], hasMore: false };
    }
    throw new Error(`vacancy_search_failed:${error.code ?? "unknown"}`);
  }

  const rows = (data ?? []) as readonly Record<string, unknown>[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    status: "ok",
    vacancies: page.map(fromPublicVacancyRow),
    hasMore,
  };
}

/** One stored ad by publisher identity, for a detail view. */
export async function getPublicVacancy(
  client: VacancyDbClient,
  providerKey: string,
  externalId: string,
): Promise<
  | { readonly status: "ok"; readonly vacancy: PublicVacancyV1 }
  | { readonly status: "not_found" }
  | { readonly status: "not_provisioned" }
> {
  const { data, error } = await client
    .from(VACANCY_TABLE)
    .select("*")
    .eq("provider_key", providerKey)
    .eq("external_id", externalId)
    .eq("is_active", true)
    // LIVENESS is the same everywhere (Train B1, 2026-09-02): an ad past its
    // own `expires_at` is not live merely because the publisher never
    // withdrew it. Every other read — the anon RPCs, the board, the count —
    // already says so; this detail read was the one path that did not.
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
    .maybeSingle();

  if (error) {
    if (error.code === UNDEFINED_TABLE) return { status: "not_provisioned" };
    throw new Error(`vacancy_get_failed:${error.code ?? "unknown"}`);
  }
  if (!data) return { status: "not_found" };

  return {
    status: "ok",
    vacancy: fromPublicVacancyRow(data as Record<string, unknown>),
  };
}

/**
 * MEMBER READ BY PLATFORM ID — the authenticated half of the public job page.
 *
 * The sibling `getPublicVacancy` keys on (providerKey, externalId) because an
 * importer thinks in publisher identity. The PUBLIC job page keys on our own
 * uuid, because that is what its URL carries and what the anonymous projection
 * returns. Both reach the same row through the same converter; only the lookup
 * key differs.
 *
 * WHAT MAKES THIS SAFE. There is no `SECURITY DEFINER` here on purpose. The
 * caller passes an AUTHENTICATED user's own client, so the row arrives through
 * RLS policy `public_vacancies_read_active` (SELECT, role `authenticated`),
 * which is the platform's existing statement about who may read a whole ad.
 * An anonymous caller has no such policy and no table grant, so this function
 * simply returns nothing for them — the unlock cannot be spoofed from the app
 * layer, because the app layer is not what is enforcing it.
 *
 * LIVENESS. The policy checks `is_active` only, so expiry is applied here to
 * match the anonymous projection exactly. Without it a member could open an
 * expired ad that an anonymous visitor is correctly refused, and the two halves
 * of one page would disagree about whether the job still exists.
 */
export async function getPublicVacancyById(
  client: VacancyDbClient,
  id: string,
): Promise<
  | { readonly status: "ok"; readonly vacancy: PublicVacancyV1 }
  | { readonly status: "not_found" }
  | { readonly status: "not_provisioned" }
> {
  const { data, error } = await client
    .from(VACANCY_TABLE)
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
    .maybeSingle();

  if (error) {
    if (error.code === UNDEFINED_TABLE) return { status: "not_provisioned" };
    // A malformed uuid is a bad URL, not a server fault — same treatment the
    // anonymous reader gives it.
    if (error.code === "22P02") return { status: "not_found" };
    throw new Error(`vacancy_get_by_id_failed:${error.code ?? "unknown"}`);
  }
  if (!data) return { status: "not_found" };

  return {
    status: "ok",
    vacancy: fromPublicVacancyRow(data as Record<string, unknown>),
  };
}

/**
 * The signed-in worker's OWN saved ads, by id, projected down to the PREVIEW
 * fields.
 *
 * WHY THIS LIVES ON THE MEMBER PATH. Only a signed-in worker has a saved list,
 * and a member is already allowed the whole ad (`select *` above), so returning
 * a SUBSET of it is strictly narrower than what this module already grants —
 * never wider. The anonymous path stays where it is: `public-vacancy-preview.ts`
 * reaches the same rows only through the SECURITY DEFINER functions, because
 * `anon` holds no grant on this table at all.
 *
 * The projection is spelled out column by column so the saved list renders the
 * SAME card as the public board — no employer, no location, no description, no
 * application url — rather than quietly becoming a second, richer surface.
 *
 * LIVENESS: the BROWSABLE predicate, identical to `getPublicVacancyById` and to
 * the save RPC's own check. A bookmark whose ad has since expired or been
 * withdrawn simply does not come back — the list never shows a job the board
 * itself refuses to show.
 */
export async function listPublicVacancyPreviewsByIds(
  client: VacancyDbClient,
  ids: readonly string[],
  nowIso: string,
): Promise<
  | { readonly status: "ok"; readonly previews: readonly PublicVacancyPreview[] }
  | { readonly status: "not_provisioned" }
> {
  const wanted = [...new Set(ids)].slice(0, PREVIEW_BY_ID_MAX);
  if (wanted.length === 0) return { status: "ok", previews: [] };

  const { data, error } = await client
    .from(VACANCY_TABLE)
    .select(PREVIEW_COLUMNS)
    .in("id", wanted)
    .eq("is_active", true)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("published_at", { ascending: false });

  if (error) {
    if (error.code === UNDEFINED_TABLE) return { status: "not_provisioned" };
    // A malformed uuid in the saved set is bad data, not a server fault.
    if (error.code === "22P02") return { status: "ok", previews: [] };
    throw new Error(`vacancy_previews_by_ids_failed:${error.code ?? "unknown"}`);
  }

  const rows = (data ?? []) as readonly Record<string, unknown>[];
  return { status: "ok", previews: rows.map(toPreviewRow) };
}

/** Hard cap: the save RPC allows 200 bookmarks across both sources, so this
 *  can never be asked for more than the whole list. */
const PREVIEW_BY_ID_MAX = 200;

/** EXACTLY the columns `search_public_vacancy_previews_v1` returns. */
const PREVIEW_COLUMNS =
  "id,title_raw,profession_slug,occupation_raw,employment_form,working_time,positions,compensation_currency,compensation_min,compensation_max,source_language,attribution_code,published_at";

function toPreviewRow(row: Record<string, unknown>): PublicVacancyPreview {
  const str = (k: string): string | null =>
    typeof row[k] === "string" ? (row[k] as string) : null;
  const num = (k: string): number | null => {
    const v = row[k];
    if (v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const compensationMin = num("compensation_min");
  const compensationMax = num("compensation_max");
  return {
    id: String(row.id ?? ""),
    title: str("title_raw") ?? "",
    professionSlug: str("profession_slug"),
    occupation: str("occupation_raw"),
    employmentForm: str("employment_form"),
    workingTime: str("working_time"),
    positions: num("positions"),
    // Same suppression rule as the SQL function: a currency with no amount is
    // noise, so both are withheld together.
    compensationCurrency:
      compensationMin !== null || compensationMax !== null
        ? str("compensation_currency")
        : null,
    compensationMin,
    compensationMax,
    sourceLanguage: str("source_language"),
    attributionCode: str("attribution_code"),
    publishedAt: str("published_at"),
  };
}

/**
 * Strip the characters PostgREST treats structurally from a user-supplied
 * term.
 *
 * PostgREST's `or=` takes a COMMA-SEPARATED list and parenthesises groups, so
 * a comma or a parenthesis inside an interpolated value does not merely break
 * the query — it lets the caller add filter clauses. This is the same class of
 * problem as SQL injection, one layer up, and the fix is the same: the value
 * must never be able to carry syntax. Wildcards are stripped too, so a search
 * for "%" cannot become a full table scan of every ad.
 */
function sanitizeSearchTerm(raw: string): string {
  return raw
    .trim()
    .slice(0, 100)
    .replace(/[,()%*\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Row -> canonical contract. The exact inverse of `toPublicVacancyRow`, and
 * pure for the same reason: this is where a read layer silently loses a field
 * or promotes a derived guess into a publisher fact, and a unit test catches
 * that where an integration test would not.
 */
export function fromPublicVacancyRow(
  row: Record<string, unknown>,
): PublicVacancyV1 {
  const str = (k: string): string | null => {
    const v = row[k];
    return typeof v === "string" ? v : null;
  };
  const num = (k: string): number | null => {
    const v = row[k];
    if (typeof v === "number") return v;
    // numeric columns arrive as strings over PostgREST.
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
      return Number(v);
    }
    return null;
  };
  const strList = (k: string): readonly string[] => {
    const v = row[k];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  };

  const translationStatus = str("translation_status");

  return {
    providerKey: (str("provider_key") ?? "") as VacancyProviderKey,
    externalId: str("external_id") ?? "",
    contentHash: str("content_hash") ?? "",
    lifecycle: (str("lifecycle") ?? "published") as VacancyLifecycle,
    channel: (str("channel") ?? "snapshot") as VacancyImportChannel,

    titleRaw: str("title_raw") ?? "",
    descriptionRaw: str("description_raw") ?? "",
    sourceLanguage: str("source_language") ?? "",

    employer: {
      name: str("employer_name"),
      externalOrgId: str("employer_external_org_id"),
      homepage: str("employer_homepage"),
    },
    location: {
      country: str("country") ?? "",
      region: str("region"),
      city: str("city"),
      lat: num("lat"),
      lng: num("lng"),
    },
    compensation: {
      currency: str("compensation_currency"),
      min: num("compensation_min"),
      max: num("compensation_max"),
      description: str("compensation_description"),
    },

    employmentForm: (str("employment_form") ?? "unknown") as VacancyEmploymentForm,
    workingTime: (str("working_time") ?? "unknown") as VacancyWorkingTime,
    positions: num("positions"),

    startDate: str("start_date"),
    publishedAt: str("published_at") ?? "",
    expiresAt: str("expires_at"),
    capturedAt: str("captured_at") ?? "",

    occupationRaw: str("occupation_raw"),
    occupationConceptId: str("occupation_concept_id"),

    professionSlug: str("profession_slug"),
    skillSlugs: strList("skill_slugs"),
    categorizationOrigin:
      str("categorization_origin") === "publisher" ? "publisher" : "derived",

    requiredLanguages: strList("required_languages"),

    applicationUrl: str("application_url"),
    attributionCode: str("attribution_code") ?? "",

    // A row with no translation row stays null rather than becoming an empty
    // translation — "we never asked" and "we asked and got nothing" are
    // different facts and the presentation layer treats them differently.
    translation: translationStatus
      ? {
          targetLanguage: str("translation_target_language") ?? "",
          status: translationStatus as "pending" | "unavailable" | "available" | "failed" | "needs_review",
          titleText: str("translation_title_text"),
          descriptionText: str("translation_description_text"),
          provider: str("translation_provider"),
        }
      : null,

    transformVersion: str("transform_version") ?? "",
    requestRef: str("request_ref") ?? "",
  };
}

/**
 * The newest confirmed refresh across the supply a worker can currently see.
 *
 * `last_seen_at` is the importer's own record of the last time it re-confirmed
 * an ad still existed at the publisher, so the maximum across the visible rows
 * IS the age of the supply. Deliberately reads through the SAME RLS-scoped
 * client and the SAME `is_active` predicate as the board: the number describes
 * exactly the rows the worker is being shown, not a broader operator view.
 *
 * Uses `vacancy_import_cursors` NOWHERE — that table is RLS-enabled with no
 * policy and granted only to postgres/service_role. See source-freshness.ts.
 */
export async function readSupplyLastRefreshedAt(
  client: VacancyDbClient,
  filters: Pick<VacancySearchFiltersV1, "country" | "nowIso">,
): Promise<{ status: VacancySearchStatus; lastRefreshedAt: string | null }> {
  let q = client
    .from(VACANCY_TABLE)
    .select("last_seen_at")
    .eq("is_active", true)
    .or(`expires_at.is.null,expires_at.gt.${filters.nowIso}`);

  if (filters.country) {
    q = q.eq("country", filters.country.trim().toUpperCase());
  }

  // ORDER DIRECTION IS THE INDEX (Lane H, 2026-09-06) — the same trap the
  // board listing above fell into. `last_seen_at` is NOT NULL, so DESC NULLS
  // LAST returns exactly what plain DESC did; the difference is that
  // `public_vacancies_active_last_seen_idx (last_seen_at DESC NULLS LAST, id)
  // WHERE is_active` (migration 20260906070000) can only serve an ORDER BY
  // whose null placement matches. Measured before: 869 calls, mean 270.8 ms,
  // max 6,747 ms — an index-only scan over every live row plus a top-N sort
  // to find ONE value, on every board render. Walked from the top, the read
  // stops at the first live row.
  const { data, error } = await q
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) {
    if (error.code === UNDEFINED_TABLE) {
      return { status: "not_provisioned", lastRefreshedAt: null };
    }
    throw new Error(`vacancy_freshness_failed:${error.code ?? "unknown"}`);
  }

  const row = (data ?? [])[0] as { last_seen_at?: unknown } | undefined;
  const value = typeof row?.last_seen_at === "string" ? row.last_seen_at : null;
  return { status: "ok", lastRefreshedAt: value };
}
