-- @human-gate-approved
-- Public vacancy PREVIEW v1 — the anonymous projection of the imported job supply.
--
-- WHY THIS EXISTS
-- `public_vacancies` holds 44,113 real ads (38,142 active+unexpired as measured
-- 2026-08-18) behind ONE policy: `public_vacancies_read_active`, SELECT for
-- `authenticated` only. Anonymous visitors and search engines therefore see
-- nothing, so the largest asset in the product generates zero acquisition.
--
-- THE RULE THIS IMPLEMENTS (owner directive 2026-08-18 §5)
-- Jobs must be publicly DISCOVERABLE, but anonymous callers must NOT receive the
-- complete vacancy. Anonymous may see: title, safe category/profession,
-- employment form, working time, positions, publication date, and compensation
-- ONLY where the publisher genuinely supplied it.
--
-- Anonymous must NOT receive: employer identity, employer homepage, country,
-- region, city, coordinates, the source application URL, the full description,
-- or the free-text compensation note.
--
-- HOW THE RESTRICTION IS ENFORCED
-- NOT by widening the table's RLS — the `authenticated`-only policy is left
-- exactly as it is. Instead these SECURITY DEFINER functions are the ONLY anon
-- path, and they enumerate the safe columns in their RETURNS TABLE clause. A
-- restricted column cannot leak through HTML, RSC, JSON, metadata, OpenGraph,
-- JSON-LD, sitemap or an error response, because the function physically never
-- selects it. Adding a field to the public surface is a deliberate migration,
-- not an accident in a component.
--
-- SAME PROJECTION FOR BOTS AND HUMANS — no cloaking. The anon role and an
-- unauthenticated crawler receive byte-identical rows.
--
-- ATTRIBUTION / LICENCE NOTE (flagged for the owner, deliberately not silent)
-- `attribution_code` IS returned. The imported content is published under an
-- open licence whose attribution obligation applies wherever the content is
-- displayed, including the anonymous preview. Because today's only provider is
-- a national employment service, attribution makes the SOURCE — and therefore
-- the country — inferable, even though no country column is returned. That is a
-- licence obligation in tension with the "no country" rule, resolved in favour
-- of the legal obligation. If the owner prefers the opposite, the remedy is a
-- product decision about which sources may appear anonymously, not the removal
-- of attribution.
--
-- LIVENESS is decided here, at read time, from the two facts stored separately:
-- `is_active` (did the publisher withdraw it?) and `expires_at` (has its stated
-- validity passed?). A withdrawn or expired ad is never publicly visible.
--
-- RED class (SECURITY DEFINER + GRANT to anon). ZERO tables, columns, policies,
-- triggers or indexes created; ZERO existing objects modified; ZERO DML.
-- Rollback: supabase/rollbacks/20260818140000_public_vacancy_preview_v1.down.sql

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
  with safe as (
    select v.*
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
        -- Matched against the PUBLISHER'S OWN TITLE only. The description is a
        -- restricted field; searching it anonymously would let a caller confirm
        -- restricted content by probing, which is the same leak by another route.
        or v.title_raw ilike '%' || replace(replace(btrim(p_query), '%', '\%'), '_', '\_') || '%'
      )
  ), counted as (
    select count(*) as n from safe
  )
  select
    s.id,
    s.title_raw,
    s.profession_slug,
    s.occupation_raw,
    s.employment_form,
    s.working_time,
    s.positions,
    -- Compensation is shown ONLY when genuinely supplied. A currency with no
    -- amount is noise, so both are suppressed together.
    case when s.compensation_min is not null or s.compensation_max is not null
         then s.compensation_currency end,
    s.compensation_min,
    s.compensation_max,
    s.source_language,
    s.attribution_code,
    s.published_at,
    c.n
  from safe s cross join counted c
  order by s.published_at desc nulls last, s.id
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
    v.title_raw,
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
    v.attribution_code,
    v.published_at
  from public.public_vacancies v
  where v.id = p_id
    and v.is_active
    and (v.expires_at is null or v.expires_at > now());
$$;

-- ── Live governed count (replaces the pinned landing constant) ──────────────
-- Returns only aggregates. No row, no employer, no location.
create or replace function public.count_public_vacancies_v1()
returns table (
  active_vacancies bigint,
  distinct_employers bigint,
  last_refreshed_at timestamptz
) language sql security definer set search_path = public stable as $$
  select
    count(*)::bigint,
    count(distinct v.employer_name)::bigint,
    max(v.last_seen_at)
  from public.public_vacancies v
  where v.is_active
    and (v.expires_at is null or v.expires_at > now());
$$;

-- The anon path is these three functions and nothing else.
--
-- REVOKE FROM PUBLIC FIRST. A bare `grant execute ... to anon` leaves the
-- DEFAULT PUBLIC EXECUTE grant in place — the exact idiom behind the 2026-07-22
-- P0, where a grant no migration diff revealed made a definer function reachable
-- by every role. `scripts/check-anon-secdef-allowlist.mts` condition 4 fails on
-- the `=X` ACL entry even for allowlisted functions, so this is not optional.
revoke execute on function public.search_public_vacancy_previews_v1(p_query text, p_profession_slug text, p_limit integer, p_offset integer) from public;
revoke execute on function public.get_public_vacancy_preview_v1(p_id uuid) from public;
revoke execute on function public.count_public_vacancies_v1() from public;

grant execute on function public.search_public_vacancy_previews_v1(p_query text, p_profession_slug text, p_limit integer, p_offset integer) to anon, authenticated;
grant execute on function public.get_public_vacancy_preview_v1(p_id uuid) to anon, authenticated;
grant execute on function public.count_public_vacancies_v1() to anon, authenticated;
