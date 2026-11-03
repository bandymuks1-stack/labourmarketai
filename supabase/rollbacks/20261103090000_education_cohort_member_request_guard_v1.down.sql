-- Rollback for 20261103090000_education_cohort_member_request_guard_v1
-- Restores, exactly: set_education_cohort_member_v1 as 20260903120000 created it,
-- decide_education_cohort_join_v1 and education_cohort_members_select as
-- 20261102160000 created them. No data changes: rows and audit entries written
-- while the forward version was live stay as they are.

begin;

create or replace function public.set_education_cohort_member_v1(
  p_cohort_id uuid,
  p_profile_id uuid,
  p_status text default 'active'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_status not in ('active', 'left') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select organization_id into v_org from public.education_cohorts where id = p_cohort_id and archived_at is null;
  if v_org is null then raise exception 'cohort_not_found' using errcode = '42501'; end if;
  if not public.manages_organization(v_org) then raise exception 'not_manager' using errcode = '42501'; end if;
  -- The learner must already be linked to THIS institution as a student
  -- (accepted invitation → engagement context). Membership never creates a
  -- relationship the learner did not accept.
  if not exists (
    select 1 from public.engagement_contexts ec
    where ec.profile_id = p_profile_id and ec.organization_id = v_org
      and ec.relationship_slug = 'student' and ec.status = 'active'
  ) then
    raise exception 'not_a_linked_learner' using errcode = '42501';
  end if;
  insert into public.education_cohort_members (cohort_id, profile_id, status, added_by, left_at)
  values (p_cohort_id, p_profile_id, p_status, v_uid, case when p_status = 'left' then now() end)
  on conflict (cohort_id, profile_id) do update
    set status  = excluded.status,
        left_at = case when excluded.status = 'left' then now() else null end;
end;
$$;

revoke execute on function public.set_education_cohort_member_v1(uuid, uuid, text) from public, anon;
grant execute on function public.set_education_cohort_member_v1(uuid, uuid, text) to authenticated;

create or replace function public.decide_education_cohort_join_v1(
  p_cohort_id uuid,
  p_profile_id uuid,
  p_decision text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_org      uuid;
  v_basis    text;
  v_existing uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_decision not in ('accept', 'decline') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  select organization_id into v_org from public.education_cohorts where id = p_cohort_id and archived_at is null;
  if v_org is null then raise exception 'cohort_not_found' using errcode = '42501'; end if;
  v_basis := public.education_cohort_decider_basis_v1(v_org);
  if v_basis is null then raise exception 'not_manager' using errcode = '42501'; end if;
  -- Nobody decides their own request (the decision-0028 rule, applied here).
  if p_profile_id = v_uid then raise exception 'self_decision_not_allowed' using errcode = '42501'; end if;
  perform 1 from public.education_cohort_members
   where cohort_id = p_cohort_id and profile_id = p_profile_id and status = 'requested'
   for update;
  if not found then raise exception 'no_pending_request' using errcode = '42501'; end if;

  if p_decision = 'decline' then
    update public.education_cohort_members
       set status = 'declined', decided_at = now()
     where cohort_id = p_cohort_id and profile_id = p_profile_id;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (v_uid, 'education_cohort_join_declined_v1', 'education_cohorts', p_cohort_id,
      jsonb_build_object('profile_id', p_profile_id, 'authority_basis', v_basis));
    return 'declined';
  end if;

  -- The learner's request is their acceptance of the student relationship:
  -- reuse an active one, else create it exactly as an accepted invitation does.
  select id into v_existing from public.engagement_contexts
   where profile_id = p_profile_id and organization_id = v_org
     and relationship_slug = 'student' and status = 'active' limit 1;
  if v_existing is null then
    insert into public.engagement_contexts
      (profile_id, organization_id, relationship_slug, status, is_primary, title, hash_self)
    values
      (p_profile_id, v_org, 'student', 'active', false, null,
       encode(extensions.digest(p_profile_id::text || ':student:' || v_org::text, 'sha256'), 'hex'));
  end if;

  update public.education_cohort_members
     set status = 'active', added_by = null, added_at = now(), decided_at = now(), left_at = null,
         -- Request content ends with the request: an active row is visible to
         -- external managers (unchanged rule), so it carries no learner-typed text.
         request_label = null, request_note = null
   where cohort_id = p_cohort_id and profile_id = p_profile_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'education_cohort_join_accepted_v1', 'education_cohorts', p_cohort_id,
    jsonb_build_object('profile_id', p_profile_id, 'authority_basis', v_basis));
  return 'accepted';
end;
$$;

revoke execute on function public.decide_education_cohort_join_v1(uuid, uuid, text) from public, anon;
grant execute on function public.decide_education_cohort_join_v1(uuid, uuid, text) to authenticated;

drop policy if exists education_cohort_members_select on public.education_cohort_members;
create policy education_cohort_members_select on public.education_cohort_members for select
  using (
    profile_id = auth.uid()
    or (status in ('active', 'left')
        and public.manages_organization(public.education_cohort_organization_v1(cohort_id)))
    or (status not in ('active', 'left')
        and public.is_education_cohort_internal_decider_v1(public.education_cohort_organization_v1(cohort_id)))
    or public.is_admin()
  );

commit;
