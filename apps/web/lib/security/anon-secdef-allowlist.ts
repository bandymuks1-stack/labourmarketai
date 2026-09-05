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
      "No caller identity is consulted, because the projection itself is the authorization: since 20260824120000 the function returns only fields the owner ruled public (category/occupation, employment form, working time, positions, publication date, compensation where genuinely supplied, source language). `title_raw` and `attribution_code` are returned as NULL — the raw title embeds employer and location wording, and the named source identifies the country (owner directive 2026-08-24). Employer identity, homepage, country, region, city, coordinates, application URL, full description and the compensation note are never selected. Row filter `is_active AND (expires_at is null OR expires_at > now())` so withdrawn and expired ads are invisible.",
    inputValidation:
      "`p_query` is trimmed and its LIKE metacharacters (`%`, `_`) are escaped before interpolation into an ILIKE pattern, so a caller cannot turn the search box into a wildcard scan. Matching is restricted to `occupation_raw` — the field the card displays; the title and description are deliberately NOT searched, because probing a restricted field is a disclosure by another route. `p_limit` is clamped to 1..50 and `p_offset` floored at 0.",
    abuseControls:
      "No DB-level rate limit. Read-only and idempotent; the abuse ceiling is scraping of a deliberately public projection of already-public employment-service ads. Page size is hard-capped at 50 in SQL, so the endpoint cannot be asked for the whole table in one call.",
    definerJustification:
      "`public_vacancies` grants SELECT to `authenticated` only and has no anon policy — proven in production: a direct anon read fails with 42501. DEFINER is what allows a NARROWER public projection without weakening that policy, which is the explicit requirement (expose by projection, never by widening RLS).",
    residualRisk:
      "Owner directive 2026-08-24 reversed the v1 attribution decision: the named source identified the country, so `attribution_code` is now NULL for anonymous callers and the UI renders a generic source line. The full named licence attribution is rendered for members, where the licensed content (title, description, employer, apply URL) is actually displayed. Whether the source licence also requires named attribution beside the anonymous occupation-only projection is recorded as an open owner/legal question.",
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
      "Same NULLed title/attribution boundary as the search function since 20260824120000. No JobPosting JSON-LD is emitted on the page, because that schema requires hiringOrganization and jobLocation, which are restricted fields.",
  },
  {
    name: "public_plans_v1",
    identityArgs: "",
    mutates: false,
    publicCaller:
      "Public /pricing page (and the signed-in organisation account). Renders the price FIGURE from plans.price_eur_monthly — the one home of the figure (owner-approved 2026-09-05: FREE 0, ORGANIZATION 99).",
    authorization:
      "Returns the catalogue columns only — slug, name_lt, name_en, price_eur_monthly — for active plans. No profile, organisation, subscription or customer data is reachable through it.",
    inputValidation:
      "No parameters, so there is no input surface.",
    abuseControls:
      "Read-only; returns at most the handful of active catalogue rows. Nothing to enumerate beyond the public price list.",
    definerJustification:
      "`plans` has no anon/authenticated table privilege since the 2026-07-22 revoke pass (RLS plans_select is true, but the GRANT is absent), so the public page could not render a price. DEFINER exposes the catalogue without widening the table grant.",
    residualRisk:
      "Discloses the published price list, which is the purpose of the page.",
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
    name: "list_public_vacancy_sitemap_v1",
    identityArgs: "p_limit integer, p_offset integer",
    mutates: false,
    publicCaller:
      "The public job sitemap (app/jobs-sitemap.xml + app/jobs-sitemap/[shard]). Read by search-engine crawlers, which are anonymous by definition — a sitemap that required a session would be unreadable by the only clients it exists for.",
    authorization:
      "The projection IS the authorization, and it is strictly NARROWER than the already-approved preview functions: the RETURNS TABLE clause exposes only `id` and `last_modified`. `id` is already public — it is the /jobs/[id] URL itself. No title, employer, location, compensation, description or application URL is selected, so none can leak through the XML. Same live-row filter as the sibling functions (`is_active` AND not expired), so a withdrawn or expired ad is never advertised to a crawler.",
    inputValidation:
      "`p_limit` is clamped to 1..50000 (the sitemaps.org per-file ceiling) and `p_offset` floored at 0, both inside the SQL body. Both are integer-typed, so malformed input is rejected before the body runs.",
    abuseControls:
      "No DB-level rate limit. Read-only and idempotent. The page size is larger than the search function's 50 because a sitemap must enumerate — that is its purpose — but it enumerates ONLY opaque uuids and dates, which carry no vacancy content. Reading every shard yields a list of public URLs and nothing a scraper could not get by crawling the board.",
    definerJustification:
      "`public_vacancies` has no anon SELECT grant and no anon RLS policy. DEFINER is what narrows anon access to the two sitemap columns instead of opening the table.",
    residualRisk:
      "Discloses the exact count and publication-date distribution of the live corpus by allowing full enumeration of public job URLs. Those URLs are intended to be public and indexed, so this is the requirement rather than a side effect. `last_modified` is `published_at` and never an ingestion timestamp, so the sitemap cannot make a false freshness claim.",
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
      "DB-enforced throttle inside the function (anon_write_bounds_v1, 20260829130000): a platform-wide ceiling of 30 intakes per hour, a per-contact-email ceiling of 3 per 24 h, and an exact-duplicate check (same company name + description + contact email within 24 h returns the earlier id and writes nothing). Every per-field length ceiling is mirrored by a table CHECK. Ceilings raise errcode P0004, which the app maps to its `rate_limited` state. Still NO per-IP throttle at the database — the function never sees an address and recording one would be new PII — and NO captcha; the app-side in-memory window (3 per 15 min per client key, per instance) remains the first brake.",
    definerJustification:
      "Required. `company_need_public_intakes` deliberately grants nothing to anon and has no INSERT policy; DEFINER is the only write path, which is what keeps the table otherwise sealed.",
    residualRisk:
      "Bounded spam: at most 30 rows/hour platform-wide of ≤ ~8 KB each, and unsolicited PII may still arrive within that bound. Returns only the row's own id (the earlier one on an exact resubmission), so it is not an enumeration oracle.",
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
