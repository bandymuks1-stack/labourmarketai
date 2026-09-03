-- 20260903100000_public_vacancy_supply_counts_v1
--
-- ██ RED CLASS — human gate (migration-safety g/h: SECURITY DEFINER body swap
-- ██ + GRANT/REVOKE). Ships as a draft; applied by the owner channel only.
--
-- P0-1, the constant-cost half (FULL_PRODUCT_VISION_AUDIT_2026-09-03 §0.1).
--
-- count_public_vacancies_v1() is the anon-executable public supply count
-- (active vacancies, distinct employers, last refresh). Measured on
-- production 2026-09-03: a WARM seq scan of 9,363 heap pages took 2,821 ms;
-- with the covering index from 20260903090000 it is an index-only scan at
-- ~640 ms. Both are still a full aggregate over ~45k rows on every anonymous
-- call — the marketing proof band, the live-market command and the
-- /jobs-sitemap.xml index all pay it, and the anon role's statement_timeout
-- is 3 s. The right shape is a MAINTAINED ROW: the aggregate runs once every
-- ten minutes under postgres, and the public function reads one row.
--
-- What this does:
--   1. public_vacancy_supply_counts — a single-row table (RLS on, NO
--      policies = deny-all for every role; only the two definer functions
--      touch it).
--   2. refresh_public_vacancy_supply_counts_v1() — recomputes the row.
--      Callable ONLY by postgres (pg_cron) or the service role; anyone else
--      gets 42501. work_mem is raised at function scope so the distinct
--      aggregate never spills.
--   3. count_public_vacancies_v1() — same signature, same grants (CREATE OR
--      REPLACE keeps the existing anon/authenticated EXECUTE), body now reads
--      the row. If the row is ever missing (it is seeded below), the live
--      aggregate is the fallback — never an empty result that the sitemap
--      would read as "zero jobs".
--   4. pg_cron job every 10 minutes (pg_cron 1.6.4 is already installed for
--      ai-runs-retention-daily). Idempotent: unschedule-if-present first.
--
-- Freshness: the public figure lags the importer by at most 10 minutes. The
-- marketing copy already treats the number as a floor re-derived from
-- production (Agentai capability contract, VACANCY_PUBLISHING limitations).
--
-- Reversible: see the ROLLBACK block and supabase/rollbacks/<same name>.down.sql
-- (restores the previous function body verbatim, drops the job, function and table).

create table if not exists public.public_vacancy_supply_counts (
  singleton          boolean     primary key default true check (singleton),
  active_vacancies   bigint      not null,
  distinct_employers bigint      not null,
  last_refreshed_at  timestamptz,
  computed_at        timestamptz not null default now()
);

comment on table public.public_vacancy_supply_counts is
  'Single maintained row with the public vacancy supply counts. Written only by refresh_public_vacancy_supply_counts_v1() (pg_cron / service role); read only by count_public_vacancies_v1(). RLS on with no policies = deny-all.';

alter table public.public_vacancy_supply_counts enable row level security;

create or replace function public.refresh_public_vacancy_supply_counts_v1()
returns void
language plpgsql
security definer
set search_path = public
set work_mem = '64MB'
as $$
begin
  -- Only the scheduler (postgres) or the service role may trigger the aggregate.
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
end;
$$;

revoke execute on function public.refresh_public_vacancy_supply_counts_v1() from public, anon, authenticated;
grant execute on function public.refresh_public_vacancy_supply_counts_v1() to service_role;

comment on function public.refresh_public_vacancy_supply_counts_v1() is
  'Recomputes public_vacancy_supply_counts. Callable by postgres (pg_cron) or service_role only; every other caller gets 42501.';

-- Seed the row now (this migration runs as postgres).
select public.refresh_public_vacancy_supply_counts_v1();

-- Same signature and grants as before (CREATE OR REPLACE keeps the ACL — anon /
-- authenticated EXECUTE — but NOT the function config: `work_mem = 64MB` from
-- 20260903070000 must be re-stated here, verified on production 2026-09-03 in a
-- rolled-back probe).
--
-- Fallback shape, verified on production (EXPLAIN in a rolled-back probe): the
-- `where not exists` becomes a One-Time Filter so the live aggregate is NEVER
-- EXECUTED while the row exists; the `having not exists` removes the aggregate's
-- zero-count row, so the function returns exactly one row either way.
create or replace function public.count_public_vacancies_v1()
returns table (
  active_vacancies bigint,
  distinct_employers bigint,
  last_refreshed_at timestamptz
)
language sql
security definer
set search_path = public
set work_mem = '64MB'
stable
as $$
  select c.active_vacancies, c.distinct_employers, c.last_refreshed_at
    from public.public_vacancy_supply_counts c
   where c.singleton
  union all
  select count(*)::bigint,
         count(distinct v.employer_name)::bigint,
         max(v.last_seen_at)
    from public.public_vacancies v
   where v.is_active
     and (v.expires_at is null or v.expires_at > now())
     and not exists (select 1 from public.public_vacancy_supply_counts x where x.singleton)
  having not exists (select 1 from public.public_vacancy_supply_counts x where x.singleton);
$$;

comment on function public.count_public_vacancies_v1() is
  'Public supply counts read from the maintained public_vacancy_supply_counts row (refreshed every 10 min by pg_cron); live aggregate only as a fallback when the row is missing. Constant cost for anonymous callers (P0-1, 2026-09-03).';

-- Every 10 minutes. Idempotent: unschedule-if-present, then schedule.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'public-vacancy-supply-counts-10min') then
      perform cron.unschedule('public-vacancy-supply-counts-10min');
    end if;
    perform cron.schedule(
      'public-vacancy-supply-counts-10min',
      '*/10 * * * *',
      'select public.refresh_public_vacancy_supply_counts_v1()'
    );
  end if;
end;
$$;

-- ROLLBACK
-- (see supabase/rollbacks/20260903100000_public_vacancy_supply_counts_v1.down.sql)
-- do $$ begin if exists (select 1 from cron.job where jobname = 'public-vacancy-supply-counts-10min') then perform cron.unschedule('public-vacancy-supply-counts-10min'); end if; end $$;
-- create or replace function public.count_public_vacancies_v1() ... -- previous body: live aggregate (verbatim in the .down.sql)
-- drop function if exists public.refresh_public_vacancy_supply_counts_v1();
-- drop table if exists public.public_vacancy_supply_counts;
