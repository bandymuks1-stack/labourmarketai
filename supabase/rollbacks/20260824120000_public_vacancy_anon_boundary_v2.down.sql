-- Rollback for 20260824120000_public_vacancy_anon_boundary_v2.sql
-- Restores the 2026-08-18 v1 bodies (title_raw + attribution_code returned,
-- search matched against title_raw). ACLs are untouched in both directions.

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

