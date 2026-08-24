-- @human-gate-approved
-- Public vacancy preview v2 — close the anonymous identity/location leak.
--
-- OWNER DIRECTIVE 2026-08-24 (supersedes the 2026-08-18 §5 title/attribution
-- resolution recorded in 20260818140000_public_vacancy_preview_v1.sql):
-- before registration/authentication, public job information must NOT reveal
-- employer identity, country, city, municipality, workplace/address,
-- coordinates, contact details, or identifying external source data —
-- INCLUDING identifying wording embedded inside imported titles.
--
-- WHAT THE V1 PROJECTION LEAKED IN PRODUCTION (proven 2026-08-24, /en/jobs):
--   "Fältveterinär till Distriktsveterinärerna Stenungsund"  → employer + city
--   "Väktare till Lunds Universitet"                          → employer + city
--   "Finance & Accounting Manager till MuoviTech Sweden AB"   → employer + country
--   "Stödassistent till Långhagsgatan barnboende"             → street address
-- `title_raw` is the publisher's own free text and routinely embeds the
-- employer name and the workplace location, so returning it anonymously
-- defeats the column-level projection that already withholds employer_name,
-- country, city, lat and lng.
--
-- `attribution_code` resolves to the named national employment service
-- ("Arbetsförmedlingen (JobTech Development)"), which identifies the source
-- country. The v1 migration flagged exactly this tension and resolved it in
-- favour of the licence "unless the owner prefers the opposite"; the owner has
-- now decided the opposite. The UI renders a generic non-identifying source
-- line for anonymous callers; the full named attribution remains rendered for
-- authenticated members (the member read path is unchanged), which is where
-- the licensed content (title, description, employer, apply URL) is displayed.
--
-- THE FIX, AT THE CANONICAL BOUNDARY (not scattered UI string edits):
--   * both anon functions keep their exact signatures (CREATE OR REPLACE, so
--     existing ACLs — anon+authenticated EXECUTE, PUBLIC revoked — carry over
--     unchanged and this migration needs no GRANT/REVOKE at all);
--   * `title_raw` and `attribution_code` are returned as NULL. The columns
--     remain in the return type so no caller breaks, but the data physically
--     never leaves the database for an anonymous caller;
--   * anonymous search now matches `occupation_raw` (the taxonomy label the
--     card actually displays) instead of the hidden `title_raw`. Matching a
--     hidden field would be a probe oracle: querying "Göteborg" and receiving
--     a result set would confirm which ads are located in Göteborg — the same
--     leak by another route.
--
-- The safe fields stay exactly as v1: occupation, profession slug, employment
-- form, working time, positions, compensation (only when genuinely supplied),
-- source language, publication date. Members still receive the full ad via
-- their own RLS-authorised read path (`public_vacancies_read_active`).
--
-- ALSO FIXED HERE — the /jobs 500s (SQL 57014 statement timeout). The v1
-- search CTE `safe as (select v.*)` was referenced twice (rows + count), which
-- MATERIALIZES all ~41k matching rows at full width — including the TOASTed
-- description_raw — and spills ~4.8k temp pages to disk: measured 6,102 ms in
-- production on 2026-08-24, intermittently exceeding the anon statement
-- timeout and rendering the public board as an error page. The v2 body is a
-- single narrow-projection pass with `count(*) over ()`: measured 108 ms on
-- the same data (56x). No behaviour change beyond the boundary narrowing.
--
-- Class: formally RED only because the static classifier flags every SECURITY
-- DEFINER function body (hence the annotation above); in substance: no
-- tables/columns/policies/triggers touched, no DML, no grant changes, output
-- strictly NARROWED. Reversible:
-- supabase/rollbacks/20260824120000_public_vacancy_anon_boundary_v2.down.sql
-- restores the v1 bodies verbatim.

-- ── Search: the public job board ────────────────────────────────────────────
create or replace function public.search_public_vacancy_previews_v1(
  p_query text default null,
  p_profession_slug text default null,
  p_limit integer default 20,
  p_offset integer default 0
) returns table (
  id uuid,
  title_raw text,
  profession_slug text,
  occupation_raw text,
  employment_form text,
  working_time text,
  positions integer,
  compensation_currency text,
  compensation_min numeric,
  compensation_max numeric,
  source_language text,
  attribution_code text,
  published_at timestamptz,
  total_count bigint
) language sql security definer set search_path = public stable as $$
  -- ONE narrow pass. No CTE: the v1 double-referenced CTE materialized every
  -- matching row at full width (TOASTed description included) and took 6.1 s
  -- in production; `count(*) over ()` counts the same filtered set in the
  -- same scan at ~108 ms without ever touching the wide columns.
  select
    v.id,
    -- Owner directive 2026-08-24: the publisher's free-text title embeds
    -- employer identity and workplace location; anonymous callers never
    -- receive it. Column kept for signature stability.
    null::text as title_raw,
    v.profession_slug,
    v.occupation_raw,
    v.employment_form,
    v.working_time,
    v.positions,
    -- Compensation is shown ONLY when genuinely supplied. A currency with no
    -- amount is noise, so both are suppressed together.
    case when v.compensation_min is not null or v.compensation_max is not null
         then v.compensation_currency end,
    v.compensation_min,
    v.compensation_max,
    v.source_language,
    -- Names the national employment service and therefore the country.
    -- Anonymous callers receive the generic source line rendered in the UI;
    -- members see the full attribution from their own read path.
    null::text as attribution_code,
    v.published_at,
    count(*) over () as total_count
  from public.public_vacancies v
  where v.is_active
    and (v.expires_at is null or v.expires_at > now())
    and (
      p_profession_slug is null
      or v.profession_slug = p_profession_slug
    )
    and (
      p_query is null
      or length(btrim(p_query)) = 0
      -- Matched against the VISIBLE occupation label only. Matching the
      -- hidden title would let a caller confirm restricted content (an
      -- employer name, a city) by probing for it.
      or v.occupation_raw ilike '%' || replace(replace(btrim(p_query), '%', '\%'), '_', '\_') || '%'
    )
  order by v.published_at desc nulls last, v.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ── Detail: one indexable public job page ───────────────────────────────────
create or replace function public.get_public_vacancy_preview_v1(
  p_id uuid
) returns table (
  id uuid,
  title_raw text,
  profession_slug text,
  occupation_raw text,
  employment_form text,
  working_time text,
  positions integer,
  compensation_currency text,
  compensation_min numeric,
  compensation_max numeric,
  source_language text,
  attribution_code text,
  published_at timestamptz
) language sql security definer set search_path = public stable as $$
  select
    v.id,
    null::text as title_raw,
    v.profession_slug,
    v.occupation_raw,
    v.employment_form,
    v.working_time,
    v.positions,
    case when v.compensation_min is not null or v.compensation_max is not null
         then v.compensation_currency end,
    v.compensation_min,
    v.compensation_max,
    v.source_language,
    null::text as attribution_code,
    v.published_at
  from public.public_vacancies v
  where v.id = p_id
    and v.is_active
    and (v.expires_at is null or v.expires_at > now());
$$;
