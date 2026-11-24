-- Rollback of 20261124053000_history_read_grant_v1.
-- Refuses while any grant is still live (revoke first, with its audit row).
-- Revoked and expired grant rows are the record of who could read what, so
-- they are kept: the table is dropped only when every row has ended.

do $$
begin
  if exists (
    select 1 from public.organization_history_read_grants_v1
     where revoked_at is null and now() < expires_at
  ) then
    raise exception 'history_read_grant_live: revoke every live grant before rolling back';
  end if;
end
$$;

drop policy if exists projects_history_read_grant_select on public.projects;
drop policy if exists work_objects_history_read_grant_select on public.work_objects;
drop policy if exists organization_history_periods_history_read_grant_select on public.organization_history_periods;
drop policy if exists organization_evidence_competency_signals_history_read_grant_select on public.organization_evidence_competency_signals;
drop policy if exists organization_evidence_events_history_read_grant_select on public.organization_evidence_events;
drop policy if exists organization_evidence_parties_history_read_grant_select on public.organization_evidence_parties;
drop policy if exists organization_evidence_records_history_read_grant_select on public.organization_evidence_records;
drop policy if exists organization_people_history_read_grant_select on public.organization_people;
drop policy if exists organizations_history_read_grant_select on public.organizations;

delete from public.privacy_erasure_registry_v3
 where schema_name = 'public' and table_name = 'organization_history_read_grants_v1'
   and not exists (select 1 from public.organization_history_read_grants_v1);

drop function if exists public.my_history_read_grants_v1();
drop function if exists public.has_history_read_grant_v1(uuid);

-- The grant rows: kept unless the owner decides otherwise. To remove the
-- table too, first copy the rows to the audit record, then:
--   drop table public.organization_history_read_grants_v1;
