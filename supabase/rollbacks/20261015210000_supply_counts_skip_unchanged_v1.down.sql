-- ROLLBACK for 20261015210000_supply_counts_skip_unchanged_v1.sql
-- Restores the previous body verbatim (always recompute). Owner, ACL and
-- settings are unchanged by either version (create or replace keeps them).
create or replace function public.refresh_public_vacancy_supply_counts_v1()
returns void
language plpgsql
security definer
set search_path to 'public'
set work_mem to '64MB'
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
