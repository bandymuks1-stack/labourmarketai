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
  const { data, error } = await q
    .order("published_at", { ascending: false })
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

  const { data, error } = await q
    .order("last_seen_at", { ascending: false })
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
