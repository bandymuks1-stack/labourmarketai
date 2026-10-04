-- ROLLBACK of 20261003150550_counterparty_link_team_and_review_read_doors_v1.
-- Restores the exact bodies of the two replaced functions from
-- 20261003150500 and drops the functions this migration created. No data is touched.
begin;

create or replace function public.work_counterparty_link_valid_v1(p_link_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select exists (
    select 1
      from public.work_counterparty_links l
      join public.projects p on p.id = l.project_id
      join public.workers w on w.id = l.worker_id
     where l.id = p_link_id
       and l.revoked_at is null
       and p.organization_id = l.counterparty_organization_id
       and exists (select 1 from public.project_worker_assignments a
                    where a.project_id = l.project_id and a.worker_id = l.worker_id
                      and a.status = 'active')
       -- a member of the counterparty organization is that organization's
       -- employee, not its counterparty: employer review is their path.
       and not public.profile_is_member_of_organization_v1(w.profile_id, l.counterparty_organization_id));
$$;

create or replace function public.register_work_counterparty_link_v1(
  p_project_id uuid, p_worker_id uuid, p_party_role text default 'client')
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  v_org uuid; v_subject uuid; v_id uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_party_role is null or p_party_role not in
     ('client','end_client','project_owner','customer','contracting_party') then
    return 'invalid_party_role';
  end if;
  select p.organization_id into v_org from public.projects p where p.id = p_project_id;
  if not found then return 'project_not_found'; end if;
  if v_org is null then return 'project_has_no_organization'; end if;
  if not public.profile_manages_organization_v1(uid, v_org) then return 'not_authorized'; end if;
  select w.profile_id into v_subject from public.workers w where w.id = p_worker_id;
  if not found then return 'worker_not_found'; end if;
  if v_subject is not null and v_subject = uid then return 'subject_cannot_register_own_counterparty'; end if;
  if not exists (select 1 from public.project_worker_assignments a
                  where a.project_id = p_project_id and a.worker_id = p_worker_id and a.status = 'active') then
    return 'no_work_relationship';
  end if;
  if public.profile_is_member_of_organization_v1(v_subject, v_org) then
    return 'subject_is_member_of_counterparty';
  end if;
  if public.profiles_share_organization_v1(v_subject, uid) then
    return 'counterparty_not_independent';
  end if;

  select l.id into v_id from public.work_counterparty_links l
   where l.worker_id = p_worker_id and l.project_id = p_project_id
     and l.counterparty_organization_id = v_org and l.party_role = p_party_role
     and l.revoked_at is null;
  if found then return 'already_registered'; end if;

  insert into public.work_counterparty_links
    (worker_id, project_id, counterparty_organization_id, party_role, basis, established_by)
  values (p_worker_id, p_project_id, v_org, p_party_role, 'project_assignment', uid)
  returning id into v_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'register_work_counterparty_link', 'work_counterparty_links', v_id,
    jsonb_build_object('project_id', p_project_id, 'worker_id', p_worker_id,
                       'counterparty_organization_id', v_org, 'party_role', p_party_role));
  return 'registered';
end $$;


drop function if exists public.entry_review_states_v1(uuid[]);
drop function if exists public.counterparty_review_entry_detail_v1(uuid);
drop function if exists public.list_counterparty_link_candidates_v1(uuid);
drop function if exists public.work_relationship_active_v1(uuid, uuid);

commit;
