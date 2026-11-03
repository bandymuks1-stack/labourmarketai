-- @human-gate-approved — RED draft J-12 follow-up (owner condition 2026-11-03); NOT applied. Apply only after explicit owner approval, via Supabase MCP apply_migration.
-- 20261103090000_education_cohort_member_request_guard_v1
--
-- ██ RED CLASS — human gate (replaces a SECURITY DEFINER command that writes a
-- ██ membership table). Draft; owner-channel apply only, never auto-merged.
--
-- GAP. `set_education_cohort_member_v1` (20260903120000) gates on
-- `manages_organization`, which admits `external_manager`, and its upsert
-- overwrote ANY existing row's status. So a request row (requested / declined /
-- withdrawn, 20261102160000) could be flipped to active or left by an external
-- manager, bypassing `education_cohort_decider_basis_v1`, and the
-- learner-typed `request_label` / `request_note` stayed on an active/left row
-- that external managers can read. That breaks the owner's 2026-11-03
-- condition (no access for external managers by default).
--
-- FIX — the smallest change, every other behaviour identical:
--   * a row in request state is refused (`request_row_use_decide`): only
--     decide / withdraw / archive handle requests;
--   * every write to active / left clears request_label and request_note, so
--     no learner-typed request text is ever left on a member row.
-- The authority for active / left members (`manages_organization`) and the
-- linked-learner rule are unchanged — narrowing that is a separate decision.
--
-- Reversible: supabase/rollbacks/20261103090000_education_cohort_member_request_guard_v1.down.sql
-- (restores the 20260903120000 function text exactly).

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
  v_current text;
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
  -- A request row is decided only by decide / withdraw / archive (J-12), never
  -- flipped here — this command admits external managers.
  select status into v_current from public.education_cohort_members
   where cohort_id = p_cohort_id and profile_id = p_profile_id
   for update;
  if v_current in ('requested', 'declined', 'withdrawn') then
    raise exception 'request_row_use_decide' using errcode = '42501';
  end if;
  insert into public.education_cohort_members (cohort_id, profile_id, status, added_by, left_at)
  values (p_cohort_id, p_profile_id, p_status, v_uid, case when p_status = 'left' then now() end)
  on conflict (cohort_id, profile_id) do update
    set status        = excluded.status,
        left_at       = case when excluded.status = 'left' then now() else null end,
        request_label = null,
        request_note  = null
  where public.education_cohort_members.status in ('active', 'left');
end;
$$;

revoke execute on function public.set_education_cohort_member_v1(uuid, uuid, text) from public, anon;
grant execute on function public.set_education_cohort_member_v1(uuid, uuid, text) to authenticated;

-- ROLLBACK
-- (see supabase/rollbacks/20261103090000_education_cohort_member_request_guard_v1.down.sql)
-- create or replace function public.set_education_cohort_member_v1(...) — the 20260903120000 text.
