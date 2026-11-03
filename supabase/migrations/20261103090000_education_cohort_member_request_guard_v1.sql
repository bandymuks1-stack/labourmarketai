-- @human-gate-approved — RED draft J-12 access closure (owner approval with conditions 2026-11-03); NOT applied. Apply only after explicit owner approval, via Supabase MCP apply_migration.
-- 20261103090000_education_cohort_member_request_guard_v1
--
-- ██ RED CLASS — human gate (replaces two SECURITY DEFINER commands that write
-- ██ a membership table and tightens its select policy). Draft; owner-channel
-- ██ apply only, never auto-merged.
--
-- Owner, 2026-11-03 (conditions 1–4): the old member command must not process
-- learner request rows or bypass the J-12 decision; an external manager
-- without an explicit institution delegation may neither CHANGE MEMBERSHIP nor
-- READ what the learner submitted; no alternative access path may remain; the
-- learner's name and note are protected, and protecting them must not destroy
-- records or audit history.
--
-- GAPS CLOSED
--   1. set_education_cohort_member_v1 (20260903120000) gated on
--      manages_organization (admits external_manager) and its upsert overwrote
--      ANY row: an external manager could flip a request row, bypassing
--      education_cohort_decider_basis_v1. Now: the J-12 decider basis gates it
--      (internal owner/admin/manager only) and request rows are refused.
--   2. education_cohort_members_select (20261102160000) still let
--      manages_organization (incl. external_manager) read active/left rows —
--      and with them request_label / request_note of members who joined by
--      request. Now: a membership row is readable by the learner, the
--      institution's own owner/admin/manager, and admin only.
--
-- NOTHING IS DESTROYED. Because external managers no longer read any member
-- row, the learner-typed label and note no longer need clearing to be
-- protected: decide_education_cohort_join_v1 stops nulling them on accept (the
-- 20261102160000 version did), so the learner's own request record survives
-- membership and stays readable to the learner, internal deciders and admin.
-- No column, row or audit entry is removed; set_education_cohort_member_v1
-- now also writes an audit row (actor + authority basis).
--
-- Unchanged on purpose (listed in the PR inventory): create / update of
-- programmes and cohorts, and the programme / cohort select policies, keep
-- manages_organization — they hold no learner data and no membership; narrowing
-- them is a separate decision.
--
-- Reversible: supabase/rollbacks/20261103090000_education_cohort_member_request_guard_v1.down.sql
-- (restores all three objects' current text exactly).

-- ── 1. Membership command: internal deciders only; request rows refused ─────

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
  v_uid     uuid := auth.uid();
  v_org     uuid;
  v_basis   text;
  v_current text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_status not in ('active', 'left') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select organization_id into v_org from public.education_cohorts where id = p_cohort_id and archived_at is null;
  if v_org is null then raise exception 'cohort_not_found' using errcode = '42501'; end if;
  -- Only the institution's own owner / admin / manager changes membership;
  -- never external_manager without an explicit delegation (owner 2026-11-03).
  v_basis := public.education_cohort_decider_basis_v1(v_org);
  if v_basis is null then raise exception 'not_manager' using errcode = '42501'; end if;
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
  -- A request row is decided only by decide / withdraw / archive (J-12).
  select status into v_current from public.education_cohort_members
   where cohort_id = p_cohort_id and profile_id = p_profile_id
   for update;
  if v_current in ('requested', 'declined', 'withdrawn') then
    raise exception 'request_row_use_decide' using errcode = '42501';
  end if;
  insert into public.education_cohort_members (cohort_id, profile_id, status, added_by, left_at)
  values (p_cohort_id, p_profile_id, p_status, v_uid, case when p_status = 'left' then now() end)
  on conflict (cohort_id, profile_id) do update
    set status  = excluded.status,
        left_at = case when excluded.status = 'left' then now() else null end
  where public.education_cohort_members.status in ('active', 'left');
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'education_cohort_member_set_v1', 'education_cohorts', p_cohort_id,
    jsonb_build_object('profile_id', p_profile_id, 'status', p_status, 'authority_basis', v_basis));
end;
$$;

revoke execute on function public.set_education_cohort_member_v1(uuid, uuid, text) from public, anon;
grant execute on function public.set_education_cohort_member_v1(uuid, uuid, text) to authenticated;

-- ── 2. Accept keeps the learner's own request record (no nulling) ───────────

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
     set status = 'active', added_by = null, added_at = now(), decided_at = now(), left_at = null
   where cohort_id = p_cohort_id and profile_id = p_profile_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'education_cohort_join_accepted_v1', 'education_cohorts', p_cohort_id,
    jsonb_build_object('profile_id', p_profile_id, 'authority_basis', v_basis));
  return 'accepted';
end;
$$;

revoke execute on function public.decide_education_cohort_join_v1(uuid, uuid, text) from public, anon;
grant execute on function public.decide_education_cohort_join_v1(uuid, uuid, text) to authenticated;

-- ── 3. Who reads a membership row: learner, internal deciders, admin ────────

drop policy if exists education_cohort_members_select on public.education_cohort_members;
create policy education_cohort_members_select on public.education_cohort_members for select
  using (
    profile_id = auth.uid()
    or public.is_education_cohort_internal_decider_v1(public.education_cohort_organization_v1(cohort_id))
    or public.is_admin()
  );

-- ROLLBACK
-- (see supabase/rollbacks/20261103090000_education_cohort_member_request_guard_v1.down.sql)
-- restore set_education_cohort_member_v1 (20260903120000), decide_education_cohort_join_v1
-- and education_cohort_members_select (20261102160000) exactly.
