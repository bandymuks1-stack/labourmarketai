-- @human-gate-approved
-- 20260906080000_search_public_vacancy_previews_count_v2
--
-- RED by the migration-safety gate (rule g: SECURITY DEFINER replace). Same
-- signature, same grants, same anon allowlist entry — only the BODY changes.
-- Owner applies via Supabase MCP `apply_migration` after review; never
-- `supabase db push`.
--
-- MEASURED on production 2026-09-06 (Lane H, window 6):
--   * anonymous GET /lt/jobs answered HTTP 500 on 4 of 6 probes;
--   * Postgres logs: 1,571 `statement timeout` in 24 h, every sampled one
--     inside search_public_vacancy_previews_v1; 23,280 anon calls, 15.75 M ms;
--   * cause: `count(*) over ()` — a WindowAgg over every live row
--     (47,426) on every call: EXPLAIN 4,376 ms warm, 14,274 ms cold, against
--     the anon role's 3 s statement_timeout.
--
-- FIX: the unfiltered board (the landing / first page case) reads its total
-- from public.public_vacancy_supply_counts — the cron-maintained singleton
-- (refresh_public_vacancy_supply_counts_v1, every 10 min, SAME predicate;
-- computed_at 2026-09-06 07:10 UTC at write time) — and falls back to the
-- live count only if the singleton is missing. Filtered calls count with an
-- index-only scan over the active set. The listing itself walks
-- public_vacancies_active_published_idx exactly as before.
-- Measured as a SELECT with this body: unfiltered 9.7 ms; `welder` 257 ms.
--
-- Behavioural difference (stated honestly): the unfiltered total_count may be
-- up to 10 minutes old, so `hasMore` on the very last page can be off by the
-- refresh delta. Nothing else changes: same columns, same order, same limits.
--
-- Rollback = the current production body verbatim (pg_get_functiondef,
-- 2026-09-06): supabase/rollbacks/20260906080000_search_public_vacancy_previews_count_v2.down.sql

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
  with q as (
    select nullif(replace(replace(btrim(coalesce(p_query, '')), '%', '\%'), '_', '\_'), '') as needle
  ),
  total as (
    select case
      when p_profession_slug is null and (select needle from q) is null
        then coalesce(
          (select c.active_vacancies from public.public_vacancy_supply_counts c where c.singleton),
          (select count(*) from public.public_vacancies v
            where v.is_active and (v.expires_at is null or v.expires_at > now())))
      else
        (select count(*) from public.public_vacancies v
          where v.is_active and (v.expires_at is null or v.expires_at > now())
            and (p_profession_slug is null or v.profession_slug = p_profession_slug)
            and ((select needle from q) is null
                 or v.occupation_raw ilike '%' || (select needle from q) || '%'))
    end::bigint as n
  )
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
    (select n from total) as total_count
  from public.public_vacancies v
  where v.is_active
    and (v.expires_at is null or v.expires_at > now())
    and (p_profession_slug is null or v.profession_slug = p_profession_slug)
    and ((select needle from q) is null
         or v.occupation_raw ilike '%' || (select needle from q) || '%')
  order by v.published_at desc nulls last, v.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

comment on function public.search_public_vacancy_previews_v1(text, text, integer, integer) is
  'Anonymous board projection. total_count comes from the public_vacancy_supply_counts singleton when unfiltered (<= 10 min stale; hasMore on the last page may be off by the refresh delta) and from an index-only count otherwise; the listing walks public_vacancies_active_published_idx. Replaced count(*) over (), which window-counted every live row per call (1,571 anon timeouts / 24 h; Lane H 2026-09-06).';

-- ROLLBACK
-- see supabase/rollbacks/20260906080000_search_public_vacancy_previews_count_v2.down.sql
-- (recreates the function with the previous `count(*) over ()` body verbatim)
