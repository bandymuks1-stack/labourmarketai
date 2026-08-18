/**
 * Reviewed exact-signature allowlist of `SECURITY DEFINER` functions in schema
 * `public` that anonymous (logged-out) callers are permitted to EXECUTE.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * On 2026-07-22 a P0 was found and fixed: seven SECURITY DEFINER RPCs were
 * reachable by `anon` and guarded ownership with a NULL-unsafe comparison, so an
 * unauthenticated caller could rewrite and delete other people's rows. The root
 * cause was never the seven functions. It was that `GRANT EXECUTE ... TO
 * authenticated` was issued WITHOUT a matching `REVOKE ... FROM PUBLIC`, so the
 * default PUBLIC grant silently kept `anon` reachable.
 *
 * That failure mode is invisible to code review and invisible to a count. This
 * allowlist is therefore the security contract: a function may be anon-reachable
 * ONLY if it appears here, by exact identity signature, with a written contract.
 *
 * NEVER express this contract as a number. "47 anon-reachable functions" is not a
 * control — swapping one function for another keeps the count and changes the
 * risk. Only the exact-signature set below is the contract.
 *
 * HOW `identityArgs` IS DERIVED
 * -----------------------------
 * `pg_get_function_identity_arguments(oid)` — NOT the source text of the
 * migration, and NOT `pg_get_function_arguments` (which includes DEFAULT
 * clauses). Reproduce with:
 *
 *   select p.proname, pg_get_function_identity_arguments(p.oid)
 *     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 *    where n.nspname = 'public'
 *      and p.prosecdef
 *      and has_function_privilege('anon', p.oid, 'EXECUTE');
 *
 * ADDING AN ENTRY IS AN OWNER DECISION, NOT A REFACTOR.
 */

export type AnonSecdefContract = {
  /** Function name in schema `public`. */
  readonly name: string;
  /** Exact `pg_get_function_identity_arguments` output. Empty string = no args. */
  readonly identityArgs: string;
  /** Does this function write? Read-only functions are far cheaper to justify. */
  readonly mutates: boolean;
  /** The anonymous product surface that legitimately calls this. */
  readonly publicCaller: string;
  /** What stops an anonymous caller from reaching data they should not see. */
  readonly authorization: string;
  /** Input validation performed inside the function body. */
  readonly inputValidation: string;
  /** Abuse / rate-limit posture. Must be honest, including when it is absent. */
  readonly abuseControls: string;
  /** Why SECURITY DEFINER is required rather than SECURITY INVOKER + RLS. */
  readonly definerJustification: string;
  /** Known residual risk accepted by the owner. */
  readonly residualRisk: string;
};

/**
 * The four functions production actually grants to `anon` explicitly
 * (`anon=X` present in `proacl`). Verified against production 2026-07-22.
 *
 * Every other anon-reachable function in production reaches `anon` only through
 * the leftover default PUBLIC grant (`=X/postgres`) — i.e. by accident, not by
 * decision. Those are NOT listed here and must be revoked.
 */
export const ANON_SECDEF_ALLOWLIST: ReadonlyArray<AnonSecdefContract> = [
  {
    name: "search_public_vacancy_previews_v1",
    identityArgs: "p_query text, p_profession_slug text, p_limit integer, p_offset integer",
    mutates: false,
    publicCaller:
      "The public job board (app/[locale]/(marketing)/jobs). Reachable logged-out by design — this is the acquisition surface for 38,142 live imported vacancies.",
    authorization:
      "No caller identity is consulted, because the projection itself is the authorization: the RETURNS TABLE clause enumerates only fields the owner ruled public (title, category, employment form, working time, positions, publication date, compensation where genuinely supplied, licence attribution). Employer identity, homepage, country, region, city, coordinates, application URL, full description and the compensation note are never selected. Row filter `is_active AND (expires_at is null OR expires_at > now())` so withdrawn and expired ads are invisible.",
    inputValidation:
      "`p_query` is trimmed and its LIKE metacharacters (`%`, `_`) are escaped before interpolation into an ILIKE pattern, so a caller cannot turn the search box into a wildcard scan. Matching is restricted to `title_raw`; the description is deliberately NOT searched, because probing a restricted field is a disclosure by another route. `p_limit` is clamped to 1..50 and `p_offset` floored at 0.",
    abuseControls:
      "No DB-level rate limit. Read-only and idempotent; the abuse ceiling is scraping of a deliberately public projection of already-public employment-service ads. Page size is hard-capped at 50 in SQL, so the endpoint cannot be asked for the whole table in one call.",
    definerJustification:
      "`public_vacancies` grants SELECT to `authenticated` only and has no anon policy — proven in production: a direct anon read fails with 42501. DEFINER is what allows a NARROWER public projection without weakening that policy, which is the explicit requirement (expose by projection, never by widening RLS).",
    residualRisk:
      "Attribution is returned because the source licence requires it wherever the content is shown. Since today's only provider is a national employment service, attribution makes the source — and therefore the country — inferable even though no country column is returned. Accepted as a licence obligation; recorded for the owner.",
  },
  {
    name: "get_public_vacancy_preview_v1",
    identityArgs: "p_id uuid",
    mutates: false,
    publicCaller:
      "One public job page (app/[locale]/(marketing)/jobs/[id]) — the indexable unit of the acquisition funnel.",
    authorization:
      "Same projection contract as the search function: only the allowlisted public columns are selected, and the row filter `is_active AND (expires_at is null OR expires_at > now())` applies. Proven in production: a withdrawn id and an expired id each return 0 rows to anon, a live id returns 1.",
    inputValidation:
      "`p_id` is uuid-typed, so malformed input is rejected by the type system before the function body runs.",
    abuseControls:
      "No DB-level rate limit. Read-only, returns at most one row, and requires knowing a vacancy uuid — which the function itself never discloses beyond the ids already listed on the public board.",
    definerJustification:
      "Identical to the search function: the base table has no anon grant, and DEFINER is what narrows anon access to the published columns instead of opening the table.",
    residualRisk:
      "Same attribution/country inference as the search function. No JobPosting JSON-LD is emitted on the page, because that schema requires hiringOrganization and jobLocation, which are restricted fields.",
  },
  {
    name: "count_public_vacancies_v1",
    identityArgs: "",
    mutates: false,
    publicCaller:
      "Landing market-proof band. Replaces a PINNED CONSTANT with a live governed count, so a number a visitor reads is the number the database currently holds.",
    authorization:
      "Returns aggregates ONLY — active vacancy count, distinct employer count, last refresh timestamp. No row, no employer name, no location is returned in any form. Counts the same live-row filter as the other two functions.",
    inputValidation:
      "No parameters, so there is no input surface.",
    abuseControls:
      "No DB-level rate limit. Read-only and returns exactly one row of three scalars; there is nothing to enumerate.",
    definerJustification:
      "`public_vacancies` has no anon grant, so an anonymous visitor cannot count it. DEFINER exposes the aggregate without exposing any row.",
    residualRisk:
      "Discloses the size and freshness of the imported corpus and the number of distinct employers in it. Both are already stated publicly as market-coverage claims, and neither identifies an employer.",
  },
  {
    name: "get_public_business_profile_v1",
    identityArgs: "p_slug text",
    mutates: false,
    publicCaller:
      "Public business profile page (app/[locale]/business/[slug]), resolved by slug. Reachable logged-out by design.",
    authorization:
      "Row filter `o.public_profile_enabled = true`. An organization is invisible until its owner explicitly publishes it via set_business_public_profile_v1.",
    inputValidation:
      "Slug compared case-insensitively (`lower(public_slug) = lower(p_slug)`); bounded by `limit 1`.",
    abuseControls:
      "No DB-level rate limit. Read-only and idempotent, so the abuse ceiling is scraping of already-published data. Slug enumeration is possible but only discloses profiles their owners chose to publish.",
    definerJustification:
      "`organizations` has no anon SELECT grant and no anon RLS policy; DEFINER is what narrows anon access to exactly the published columns instead of opening the table.",
    residualRisk:
      "Returns owner-supplied `public_contact_email` / `public_contact_phone`. These are published-by-choice contact fields, but they remain harvestable by scrapers.",
  },
  {
    name: "get_public_business_listings_v1",
    identityArgs: "p_org_id uuid",
    mutates: false,
    publicCaller:
      "Marketplace listings section of the public business profile page (app/[locale]/business/[slug]).",
    authorization:
      "Double filter: `o.public_profile_enabled = true` AND `m.status = 'active'`. Draft and closed listings are never returned.",
    inputValidation:
      "`p_org_id` is uuid-typed so malformed input is rejected by the type system; result bounded by `limit 50`.",
    abuseControls:
      "No DB-level rate limit. Bounded by `limit 50` and read-only. Requires knowing an organization uuid, which this function does not disclose.",
    definerJustification:
      "`marketplace_listings` has no anon grant; DEFINER exposes only the eight published columns of active listings.",
    residualRisk:
      "None identified beyond scraping of listings the organization deliberately published.",
  },
  {
    name: "get_public_business_services_v1",
    identityArgs: "p_org_id uuid",
    mutates: false,
    publicCaller:
      "Services section of the public business profile page (app/[locale]/business/[slug]).",
    authorization:
      "Double filter: `o.public_profile_enabled = true` AND `s.status = 'active'`. Inactive offerings are never returned.",
    inputValidation:
      "`p_org_id` is uuid-typed so malformed input is rejected by the type system; result bounded by `limit 50`.",
    abuseControls:
      "No DB-level rate limit. Bounded by `limit 50` and read-only, so the abuse ceiling is scraping already-public data.",
    definerJustification:
      "`service_offerings` has no anon grant; DEFINER exposes only published service rows.",
    residualRisk:
      "None identified beyond scraping of services the organization deliberately published.",
  },
  {
    name: "submit_company_need_public_v1",
    identityArgs:
      "p_locale text, p_company_name text, p_contact_name text, p_contact_email text, p_contact_phone text, p_country text, p_city_region text, p_sector text, p_headcount integer, p_start_window text, p_expected_duration text, p_urgency text, p_accommodation text, p_transport_needed boolean, p_languages text, p_engagement_type text, p_description text, p_source_path text",
    mutates: true,
    publicCaller:
      "Public company-need intake form (app/[locale]/(marketing)/company-need), called through a dedicated anon client. This is the one intentional anonymous WRITE path in the product.",
    authorization:
      "None by design — anonymous submission is the feature. Containment replaces authorization: it can only INSERT into company_need_public_intakes, always with status 'new', and it reads nothing. That table has RLS enabled with ZERO policies and grants nothing to anon or authenticated (only `service_role=r`), so a submitter cannot read back their own row or anyone else's.",
    inputValidation:
      "company_name required and <=200 chars; description required and <=8000; country must match ^[A-Z]{2}$ AND appear in the ten-country allowlist; email must match a single-@ pattern and be <=254; headcount clamped to [1,100000]; urgency/accommodation/engagement_type/locale normalized to fixed enums rather than rejected; nine further per-field length ceilings each raising errcode 22023.",
    abuseControls:
      "GAP — there is NO database-level rate limit, NO duplicate-submission check, and NO per-IP or per-email throttle. An anonymous caller can insert unbounded rows of up to ~8 KB each. Any protection today lives in the application layer only and is NOT enforced here. This is the largest residual issue on the public surface and is tracked as a follow-up.",
    definerJustification:
      "Required. `company_need_public_intakes` deliberately grants nothing to anon and has no INSERT policy; DEFINER is the only write path, which is what keeps the table otherwise sealed.",
    residualRisk:
      "Spam and storage exhaustion via unthrottled inserts, plus unsolicited PII arriving in the intake table. Returns only the new row's own id, so it is not an enumeration oracle.",
  },
] as const;

/** `name(identityArgs)` — the canonical key used for every comparison. */
export function signatureOf(fn: {
  name: string;
  identityArgs: string;
}): string {
  return `${fn.name}(${fn.identityArgs})`;
}

/** The allowlisted signatures as a Set, for O(1) membership checks. */
export const ANON_SECDEF_ALLOWED_SIGNATURES: ReadonlySet<string> = new Set(
  ANON_SECDEF_ALLOWLIST.map(signatureOf),
);
