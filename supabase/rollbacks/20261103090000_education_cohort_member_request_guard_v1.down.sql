-- Rollback for 20261103090000_education_cohort_member_request_guard_v1
-- Restores, exactly: set_education_cohort_member_v1 as 20260903120000 created it.
-- Deliberately KEPT (reasons below): the non-destructive
-- decide_education_cohort_join_v1, the tightened select policy and the erasure
-- scrub. No data changes: rows and audit entries written while the forward
-- version was live stay as they are.

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

-- decide_education_cohort_join_v1 is KEPT in its forward form: the
-- 20261102160000 text nulls the learner's label and note on accept, and the
-- owner forbids destroying records (2026-11-03, condition 4).
-- The TIGHTENED select policy and the erasure scrub are deliberately KEPT.
-- Rows written while this migration was live keep request_label / request_note
-- on active / left rows (accept no longer clears them — the owner forbids
-- destroying records). Restoring the 20261102160000 policy would let
-- external managers read that text, and restoring the erasure row would let an
-- erased person's typed name survive. Both only protect, so undoing the two
-- functions never re-opens an access or erasure gap and nulls nothing.

commit;
