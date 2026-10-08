-- @human-gate-approved
-- 20261008200000_public_jobs_country_filter_v1
--
-- RED by the migration-safety gate (SECURITY DEFINER body replace + new
-- anon-executable SECURITY DEFINER functions). DRAFT PR + `needs-human-gate`;
-- applied by the owner channel via Supabase MCP `apply_migration` only.
--
-- WHY. public_vacancies now holds Swedish (provider arbetsformedlingen) AND
-- Norwegian (provider nav) rows. The anonymous board cannot tell them apart:
-- search_public_vacancy_previews_v1 has no country argument, and the anon role
-- has no table grant, so a country filter cannot be done from the app.
--
-- MEASURED on production 2026-10-08 (postgres role, parallel workers off):
--   country='NO' page (index public_vacancies_active_country_published_idx):
--       0.16 ms execution.        country='SE' page: 6.4 ms.
--   count(*) where country='SE' (exact, live): 60 ms WARM; the same live
--   aggregate grouped by country took 5,456 ms when it ran cold -> an exact
--   per-request count would blow anon's 3 s statement_timeout. So per-country
--   totals are MAINTAINED by the existing 10-minute cron, never counted live.
--
-- WHAT.
--  1. public_vacancy_supply_counts_by_country - one row per ISO alpha-2 code
--     (RLS on, NO policies = deny-all; only definer functions touch it).
--  2. refresh_public_vacancy_supply_counts_v1() - same name/grants/cron job;
--     body keeps the singleton refresh verbatim and ALSO upserts one row per
--     country (countries that vanished are zeroed, never deleted).
--  3. list_public_vacancy_country_counts_v1() - anon-executable facet: the
--     countries with active, unexpired rows and their maintained counts.
--  4. search_public_vacancy_country_board_v1(p_country, p_limit, p_offset) -
--     anon-executable page for ONE country, same projection and order key as
--     search_public_vacancy_previews_v1, total from the maintained row.
--     Country-only by design: country+profession / country+text are NOT served
--     (a rare profession inside SE walks the whole SE set -> not provably
--     within 3 s). search_public_vacancy_previews_v1 is NOT touched, so the
--     unfiltered board and the landing counter are byte-identical.
--  5. public_vacancies_active_country_board_idx - (country, published_at desc
--     nulls last, id) where is_active: matches the order key exactly so the
--     page stops after 20 rows however large a country grows (the existing
--     country index is `published_at DESC` = NULLS FIRST, which forces a sort
--     of the whole country once NO has thousands of rows). Additive.
--     Plain CREATE INDEX (a migration runs in a transaction): holds a write
--     lock on public_vacancies for the build (~130k rows, expected ~1 s).
--
-- Anon boundary: country is exposed ONLY as the selected filter value and the
-- facet; rows still carry no employer, region, city, title or attribution.
-- Rollback: supabase/rollbacks/20261008200000_public_jobs_country_filter_v1.down.sql

create table if not exists public.public_vacancy_supply_counts_by_country (
  country           text        primary key check (country ~ '^[A-Z]{2}$'),
  active_vacancies  bigint      not null,
  computed_at       timestamptz not null default now()
);

comment on table public.public_vacancy_supply_counts_by_country is
  'Maintained per-country active, unexpired vacancy counts. Written only by refresh_public_vacancy_supply_counts_v1() (pg_cron every 10 min); read only by the two country definer functions. RLS on with no policies = deny-all.';

alter table public.public_vacancy_supply_counts_by_country enable row level security;
revoke all on public.public_vacancy_supply_counts_by_country from anon, authenticated;

create index if not exists public_vacancies_active_country_board_idx
  on public.public_vacancies (country, published_at desc nulls last, id)
  where is_active;

create or replace function public.refresh_public_vacancy_supply_counts_v1()
returns void
language plpgsql
security definer
set search_path = public
set work_mem = '64MB'
as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.public_vacancy_supply_counts
    (singleton, active_vacancies, distinct_employers, last_refreshed_at, computed_at)
  select true,
         count(*)::bigint,
         count(distinct v.employer_name)::bigint,
         max(v.last_seen_at),
         now()
    from public.public_vacancies v
   where v.is_active
     and (v.expires_at is null or v.expires_at > now())
  on conflict (singleton) do update
     set active_vacancies   = excluded.active_vacancies,
         distinct_employers = excluded.distinct_employers,
         last_refreshed_at  = excluded.last_refreshed_at,
         computed_at        = excluded.computed_at;

  -- Per country, same live-row filter. Countries that no longer have a live
  -- row are zeroed (not deleted); the facet only lists count > 0.
  with live as (
    select v.country, count(*)::bigint as n
      from public.public_vacancies v
     where v.is_active
       and (v.expires_at is null or v.expires_at > now())
       and v.country ~ '^[A-Z]{2}$'
     group by v.country
  )
  insert into public.public_vacancy_supply_counts_by_country as c
    (country, active_vacancies, computed_at)
  select l.country, l.n, now() from live l
  on conflict (country) do update
     set active_vacancies = excluded.active_vacancies,
         computed_at      = excluded.computed_at;

  update public.public_vacancy_supply_counts_by_country c
     set active_vacancies = 0, computed_at = now()
   where c.active_vacancies <> 0
     and not exists (
       select 1 from public.public_vacancies v
        where v.country = c.country and v.is_active
          and (v.expires_at is null or v.expires_at > now()));
end;
$$;

revoke execute on function public.refresh_public_vacancy_supply_counts_v1() from public, anon, authenticated;
grant execute on function public.refresh_public_vacancy_supply_counts_v1() to service_role;

create or replace function public.list_public_vacancy_country_counts_v1()
returns table (country text, active_vacancies bigint)
language sql
security definer
set search_path = public
stable
as $$
  select c.country, c.active_vacancies
    from public.public_vacancy_supply_counts_by_country c
   where c.active_vacancies > 0
   order by c.active_vacancies desc, c.country;
$$;

revoke execute on function public.list_public_vacancy_country_counts_v1() from public;
grant execute on function public.list_public_vacancy_country_counts_v1() to anon, authenticated;

comment on function public.list_public_vacancy_country_counts_v1() is
  'Country facet for the public board: countries with active, unexpired vacancies and their maintained counts (<= 10 min stale). Constant cost; no public_vacancies read.';

create or replace function public.search_public_vacancy_country_board_v1(
  p_country text,
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
language plpgsql
stable security definer
set search_path to 'public'
set max_parallel_workers_per_gather to 0
as $function$
#variable_conflict use_column
declare
  v_country text := upper(btrim(coalesce(p_country, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
begin
  if v_country !~ '^[A-Z]{2}$' then
    return;
  end if;
  select c.active_vacancies into v_total
    from public.public_vacancy_supply_counts_by_country c
   where c.country = v_country;
  if v_total is null or v_total <= 0 then
    return;
  end if;
  return query
    select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form,
           v.working_time, v.positions,
           case when v.compensation_min is not null or v.compensation_max is not null
                then v.compensation_currency end,
           v.compensation_min, v.compensation_max, v.source_language,
           null::text, v.published_at, v_total
      from public.public_vacancies v
     where v.country = v_country
       and v.is_active and (v.expires_at is null or v.expires_at > now())
     order by v.published_at desc nulls last, v.id
     limit v_limit offset v_offset;
end;
$function$;

revoke execute on function public.search_public_vacancy_country_board_v1(p_country text, p_limit integer, p_offset integer) from public;
grant execute on function public.search_public_vacancy_country_board_v1(p_country text, p_limit integer, p_offset integer) to anon, authenticated;

comment on function public.search_public_vacancy_country_board_v1(text, integer, integer) is
  'Anonymous board page for ONE country (ISO alpha-2). Same projection, filter and order key as search_public_vacancy_previews_v1; total_count from the maintained per-country row. Unknown or empty country returns no rows.';

select public.refresh_public_vacancy_supply_counts_v1();

-- ROLLBACK
-- see supabase/rollbacks/20261008200000_public_jobs_country_filter_v1.down.sql
