-- Rollback for 20260906080000_search_public_vacancy_previews_count_v2
-- Restores the production body captured by pg_get_functiondef on 2026-09-06
-- (the `count(*) over ()` variant). Same signature, same grants, same
-- SECURITY DEFINER + search_path. No data is touched.

create or replace function public.search_public_vacancy_previews_v1(
  p_query text default null,
  p_profession_slug text default null,
  p_limit integer default 20,
  p_offset integer default 0)
returns table(
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
  published_at timestamp with time zone,
  total_count bigint)
language sql
stable security definer
set search_path to 'public'
as $function$
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
      or v.occupation_raw ilike '%' || replace(replace(btrim(p_query), '%', '\%'), '_', '\_') || '%'
    )
  order by v.published_at desc nulls last, v.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;
