-- Rollback for 20260903100000_public_vacancy_supply_counts_v1
-- Safe: restores the previous count_public_vacancies_v1 body verbatim (the
-- function keeps its grants), removes the cron job, the refresh function and
-- the single-row table. No user data is touched.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'public-vacancy-supply-counts-10min') then
    perform cron.unschedule('public-vacancy-supply-counts-10min');
  end if;
end;
$$;

-- Previous body (production definition read back 2026-09-03; work_mem=64MB
-- from 20260903070000 is a function config and is preserved by CREATE OR REPLACE).
create or replace function public.count_public_vacancies_v1()
returns table (
  active_vacancies bigint,
  distinct_employers bigint,
  last_refreshed_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*)::bigint,
    count(distinct v.employer_name)::bigint,
    max(v.last_seen_at)
  from public.public_vacancies v
  where v.is_active
    and (v.expires_at is null or v.expires_at > now());
$$;

drop function if exists public.refresh_public_vacancy_supply_counts_v1();

drop table if exists public.public_vacancy_supply_counts;
