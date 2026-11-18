-- Rollback for 20261103130000_agency_pool_docs_readiness_live_roster_v1
-- Restores agency_pool_docs_readiness() exactly as 20260611170000 (s6) created it
-- (legacy agencies/agency_workers pool only). Grants unchanged. No data changes.

create or replace function public.agency_pool_docs_readiness()
returns table (
  worker_id     uuid,
  docs_total    int,
  docs_valid    int,
  docs_expiring int,
  docs_attention int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_agency uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select a.id into v_agency from public.agencies a where a.profile_id = uid;
  if v_agency is null then
    return; -- not an agency owner → empty, never an error surface
  end if;

  return query
  select w.id,
         count(d.id)::int,
         count(d.id) filter (
           where d.valid_until is not null and d.valid_until > now() + interval '30 days'
         )::int,
         count(d.id) filter (
           where d.valid_until is not null
             and d.valid_until > now()
             and d.valid_until <= now() + interval '30 days'
         )::int,
         count(d.id) filter (
           where d.valid_until is null or d.valid_until <= now()
         )::int
    from public.agency_workers aw
    join public.agencies a on a.id = aw.agency_id and a.id = v_agency
    join public.workers w on w.id = aw.worker_id
    left join public.worker_documents d on d.worker_id = w.id
   where w.docs_aggregate_consent is true
   group by w.id;
end $$;

revoke all on function
  public.agency_pool_docs_readiness() from public;
grant execute on function
  public.agency_pool_docs_readiness() to authenticated;
