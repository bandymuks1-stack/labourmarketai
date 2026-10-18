-- ROLLBACK of 20261018150000_employer_profile_views_v1
-- Drops only what the migration created. employer_profile_views / organization_access_grants rows are
-- lost on rollback; export them first if the owner wants to keep the counts or VIP history.
-- The discovery projection goes back to the single-tier version of 20261018160000 (which stays).
-- caller_has_worker_relation_v1 is dropped ONLY when no policy uses it (20261018160000's
-- workers_select does) — never with CASCADE.
begin;
create or replace function public.list_discoverable_worker_profiles_v1(p_worker_ids uuid[])
returns table (
  id uuid,
  experience_years integer,
  current_location_country text,
  preferred_countries text[],
  availability_status text,
  available_from date,
  salary_min_eur integer,
  salary_max_eur integer,
  preferred_contract_type text,
  pay_basis_preference text,
  night_shifts_ok boolean,
  weekend_shifts_ok boolean,
  overtime_ok boolean,
  driving_licence_categories text[],
  own_vehicle boolean,
  own_tools boolean,
  last_active_week date,
  is_synthetic_fixture boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_worker_ids is null or cardinality(p_worker_ids) = 0 then
    return;
  end if;
  if cardinality(p_worker_ids) > 500 then
    raise exception 'Too many workers requested' using errcode = '22023';
  end if;
  if not (public.is_employer() or public.is_admin()) then
    return;
  end if;
  return query
    select w.id, w.experience_years, w.current_location_country, w.preferred_countries,
           w.availability_status, w.available_from, w.salary_min_eur, w.salary_max_eur,
           w.preferred_contract_type, w.pay_basis_preference, w.night_shifts_ok, w.weekend_shifts_ok,
           w.overtime_ok, w.driving_licence_categories, w.own_vehicle, w.own_tools,
           -- a week bucket, never an exact timestamp
           date_trunc('week', coalesce(w.updated_at, w.created_at))::date,
           -- QA fixtures by their documented markers (lib/qa/synthetic-fixture.ts); the flag leaves
           -- the database, the name and headline never do.
           (coalesce(w.display_name, '') || ' ' || coalesce(w.headline, ''))
             ~* '(\mQA[-_ ]SYNTHETIC\M|\[E2E\]|\mE2E[-_ ]FIXTURE\M)'
      from public.workers w
     where w.id = any (p_worker_ids)
       and w.profile_id is not null
       and public.worker_profile_discoverable(w.profile_id);
end;
$$;

drop function if exists public.record_worker_profile_view_v1(uuid, uuid);
drop function if exists public.organization_profile_view_plan_v1(uuid);
drop function if exists public.revoke_organization_vip_v1(uuid);
drop function if exists public.set_organization_vip_v1(uuid, int, text);
drop table if exists public.employer_profile_views;
drop table if exists public.organization_access_grants;
do $$
begin
  if not exists (select 1 from pg_policies where qual like '%caller_has_worker_relation_v1%') then
    drop function if exists public.caller_has_worker_relation_v1(uuid);
  end if;
end $$;
commit;
