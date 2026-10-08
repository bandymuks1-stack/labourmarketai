-- Rollback for 20261008200000_public_jobs_country_filter_v1
-- Restores the refresh function body from 20260903100000 verbatim and removes
-- everything the migration added. No public_vacancies row is touched.

drop function if exists public.search_public_vacancy_country_board_v1(text, integer, integer);
drop function if exists public.list_public_vacancy_country_counts_v1();

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
end;
$$;

revoke execute on function public.refresh_public_vacancy_supply_counts_v1() from public, anon, authenticated;
grant execute on function public.refresh_public_vacancy_supply_counts_v1() to service_role;

drop index if exists public.public_vacancies_active_country_board_idx;
drop table if exists public.public_vacancy_supply_counts_by_country;
