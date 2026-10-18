-- @human-gate-approved
-- ============================================================================
-- DRAFT — needs-human-gate — SECURITY (auth-core). DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20261002141500 — FAIL-CLOSED (NULL-safe) authorization in work-task,
-- workflow and invitation RPCs.
--
-- ROOT CAUSE. plpgsql `IF <NULL> THEN` does not execute the branch. A negated
-- authorization guard `if not (a = uid or b = uid or c) then <deny>` therefore
-- evaluates to `not (NULL)` = NULL when a nullable column (a/b) is NULL and no
-- other term is TRUE — and the DENY branch is SKIPPED: the caller is let in.
--   work_tasks.assignee_profile_id        NULLABLE (task with no assignee)
--   journal_entry_tasks.linked_by         NULLABLE
--   organizations.owner_profile_id        NULLABLE (latent: 0 NULL owners today)
--
-- FIX (one canonical shape, applied identically). Authorization is granted
-- only when the expression is proven TRUE; FALSE, NULL, a missing owner /
-- actor / relationship all DENY:
--     if not (<authorized expr>) then deny   ->   if not coalesce((<authorized expr>), false) then deny
-- No term is added or removed: for every input where the old guard returned a
-- definite TRUE or FALSE the new guard returns the same; ONLY the NULL case
-- changes (allow -> deny). Nothing is widened.
--
-- FUNCTIONS (CREATE OR REPLACE; same signature, same SECURITY DEFINER, same
-- pinned search_path; every other byte of every body is the live body):
--   update_work_task_v2(6)            task guard               VULNERABLE
--   set_work_task_status_v2           task guard               VULNERABLE
--   link_journal_entry_to_task_v1     task guard               VULNERABLE
--   add_work_task_dependency_v1       BLOCKER guard            VULNERABLE
--   unlink_journal_entry_from_task_v1 l.linked_by guard        VULNERABLE (entry readers)
--   start_workflow_instance_v1        task guard               VULNERABLE (members of the definition's org)
--   create_invitation_v1 / _v2        org-branch v_org_owner   VULNERABLE-LATENT
-- Left untouched (audited, not exploitable): remove_work_task_dependency_v1,
-- reopen_work_task_v1, assign_work_task_v1, create_invitation_v2 demand branch
-- (customer_requests.profile_id is NOT NULL) and every guard whose operands are
-- all boolean.
--
-- BASE = LIVE. The bodies below were built from the latest repo definition and
-- verified on a scratch PostgreSQL 16 to have md5(prosrc) EQUAL to production's
-- (add_work_task_dependency_v1 b4aa67a0..., create_invitation_v1 96e5d497...,
-- create_invitation_v2 b31af3fb..., link_journal_entry_to_task_v1 fab5806e...,
-- set_work_task_status_v2 45cd14e4..., start_workflow_instance_v1 d7ecdfa6...,
-- unlink_journal_entry_from_task_v1 d7dc3a6f..., update_work_task_v2 22dc9869...).
-- (Live bodies carry no comment-only lines for the six task/workflow functions;
-- the repo copies did, so the comment-free form is the base.)
--
-- GRANTS: unchanged — revoke public/anon, grant authenticated (identical to the
-- live ACL {postgres=X/postgres,authenticated=X/postgres}); re-asserted below.
-- RLS: NONE touched. No table, column, policy or data change.
--
-- ORDER: this migration applies to the CURRENT live signatures and lands BEFORE
-- #2123 (stage/subtask), which re-issues update_work_task_v2 and
-- link_journal_entry_to_task_v1 and must keep these guards NULL-safe.
-- ROLLBACK: supabase/rollbacks/20261002141500_work_task_authz_null_safe_v1.down.sql
-- restores the previous live bodies verbatim.
-- ============================================================================

begin;

-- ── update_work_task_v2(text, text, text, text, text, text) ─────
create or replace function public.update_work_task_v2(
  p_task_id     text,
  p_title       text,
  p_description text,
  p_priority    text,
  p_due_date    text,
  p_object_id   text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_task    uuid := nullif(trim(coalesce(p_task_id, '')), '')::uuid;
  v_title   text := nullif(trim(coalesce(p_title, '')), '');
  v_desc    text := nullif(trim(coalesce(p_description, '')), '');
  v_prio    text := nullif(trim(coalesce(p_priority, '')), '');
  v_due     date;
  v_object  uuid := nullif(trim(coalesce(p_object_id, '')), '')::uuid;
  t         record;
  v_proj_org uuid;
  v_obj_org  uuid;
  v_obj_status text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_task is null then
    return 'invalid';
  end if;
  if v_title is null
     or char_length(v_title) < 3
     or char_length(v_title) > 160 then
    return 'invalid';
  end if;
  if v_desc is not null and char_length(v_desc) > 2000 then
    return 'invalid';
  end if;
  if v_prio is null or v_prio not in ('low','normal','high') then
    return 'invalid';
  end if;
  if nullif(trim(coalesce(p_due_date, '')), '') is not null then
    v_due := trim(p_due_date)::date;
  end if;

  select wt.id, wt.project_id, wt.created_by, wt.assignee_profile_id
    into t
    from public.work_tasks wt
   where wt.id = v_task
   for update;
  if not found then
    return 'not_found';
  end if;
  if not coalesce((
    t.created_by = uid
    or t.assignee_profile_id = uid
    or public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
  ), false) then
    return 'not_found';
  end if;

  if v_object is not null then
    select wo.organization_id, wo.status into v_obj_org, v_obj_status
      from public.work_objects wo where wo.id = v_object;
    if v_obj_org is null or v_obj_status <> 'active' then
      return 'invalid_object';
    end if;
    if t.project_id is not null then
      select pr.organization_id into v_proj_org
        from public.projects pr where pr.id = t.project_id;
      if v_proj_org is null or v_obj_org <> v_proj_org then
        return 'invalid_object';
      end if;
    elsif not (public.is_org_member_or_engaged_v1(v_obj_org)
               or public.has_org_demand_access(v_obj_org)
               or public.is_admin()) then
      return 'invalid_object';
    end if;
  end if;

  update public.work_tasks wt
     set title       = v_title,
         description = v_desc,
         priority    = v_prio,
         due_at      = case when v_due is null then null else v_due::timestamptz end,
         object_id   = v_object,
         updated_at  = now()
   where wt.id = v_task;

  return 'updated';
exception
  when invalid_text_representation or datetime_field_overflow then
    return 'invalid';
end $$;

revoke all on function public.update_work_task_v2(text, text, text, text, text, text) from public;
revoke all on function public.update_work_task_v2(text, text, text, text, text, text) from anon;
grant execute on function public.update_work_task_v2(text, text, text, text, text, text) to authenticated;

-- ── set_work_task_status_v2(text, text) ─────
create or replace function public.set_work_task_status_v2(
  p_task_id text,
  p_status  text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_task   uuid := nullif(trim(coalesce(p_task_id, '')), '')::uuid;
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  t        record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_task is null
     or v_status is null
     or v_status not in ('todo','in_progress','blocked','done','cancelled') then
    return 'invalid';
  end if;

  select wt.id, wt.status, wt.project_id, wt.created_by, wt.assignee_profile_id
    into t
    from public.work_tasks wt
   where wt.id = v_task
   for update;
  if not found then
    return 'not_found';
  end if;
  if not coalesce((
    t.created_by = uid
    or t.assignee_profile_id = uid
    or public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
  ), false) then
    return 'not_found';
  end if;

  if t.status in ('done','cancelled') then
    return 'invalid_transition';
  end if;
  if t.status = v_status then
    return 'updated';
  end if;

  update public.work_tasks wt
     set status      = v_status,
         resolved_at = case when v_status in ('done','cancelled') then now() else null end,
         updated_at  = now()
   where wt.id = v_task;

  return 'updated';
exception
  when invalid_text_representation then
    return 'invalid';
end $$;

revoke all on function public.set_work_task_status_v2(text, text) from public;
revoke all on function public.set_work_task_status_v2(text, text) from anon;
grant execute on function public.set_work_task_status_v2(text, text) to authenticated;

-- ── link_journal_entry_to_task_v1(text, text) ─────
create or replace function public.link_journal_entry_to_task_v1(
  p_entry_id text,
  p_task_id  text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_entry  uuid := nullif(trim(coalesce(p_entry_id, '')), '')::uuid;
  v_task   uuid := nullif(trim(coalesce(p_task_id, '')), '')::uuid;
  e        record;
  t        record;
  v_active int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_entry is null or v_task is null then
    return 'invalid';
  end if;

  select je.id, je.worker_id, je.engagement_context_id, je.deleted_at, je.superseded_by
    into e
    from public.journal_entries je
   where je.id = v_entry;
  if not found or not public.can_read_journal_entry_v1(v_entry) then
    return 'not_found';
  end if;
  if e.deleted_at is not null or e.superseded_by is not null then
    return 'entry_not_current';
  end if;

  select wt.id, wt.project_id, wt.created_by, wt.assignee_profile_id, wt.status
    into t
    from public.work_tasks wt
   where wt.id = v_task;
  if not found or not coalesce((
    t.created_by = uid
    or t.assignee_profile_id = uid
    or public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
  ), false) then
    return 'not_found';
  end if;

  select count(*) into v_active
    from public.journal_entry_tasks jet
   where jet.task_id = v_task and jet.unlinked_at is null;
  if v_active >= 200 then
    return 'limit_reached';
  end if;

  select count(*) into v_active
    from public.journal_entry_tasks jet
   where jet.entry_id = v_entry and jet.unlinked_at is null;
  if v_active >= 20 then
    return 'limit_reached';
  end if;

  insert into public.journal_entry_tasks (entry_id, task_id, linked_by)
  values (v_entry, v_task, uid)
  on conflict do nothing;

  if not found then
    return 'already_linked';
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'journal_entry_task_linked', 'journal_entry_tasks', v_entry,
          jsonb_build_object('task_id', v_task));

  return 'ok';
end;
$$;

revoke all on function public.link_journal_entry_to_task_v1(text, text) from public;
revoke all on function public.link_journal_entry_to_task_v1(text, text) from anon;
grant execute on function public.link_journal_entry_to_task_v1(text, text) to authenticated;

-- ── add_work_task_dependency_v1(text, text) ─────
create or replace function public.add_work_task_dependency_v1(
  p_blocker_task_id text,
  p_blocked_task_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_blocker  uuid := nullif(trim(coalesce(p_blocker_task_id, '')), '')::uuid;
  v_blocked  uuid := nullif(trim(coalesce(p_blocked_task_id, '')), '')::uuid;
  t          record;
  b          record;
  v_blocked_org uuid;
  v_blocker_org uuid;
  v_cycle    boolean;
  v_depth_hit boolean;
  v_inserted int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_blocker is null or v_blocked is null or v_blocker = v_blocked then
    return 'invalid';
  end if;

  select wt.id, wt.project_id, wt.created_by, wt.assignee_profile_id
    into t
    from public.work_tasks wt
   where wt.id = v_blocked
   for update;
  if not found then
    return 'not_found';
  end if;
  if not (
    public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
    or (t.project_id is null and t.created_by = uid)
  ) then
    if t.created_by = uid or t.assignee_profile_id = uid then
      return 'not_allowed';
    end if;
    return 'not_found';
  end if;

  select wt.id, wt.project_id, wt.created_by, wt.assignee_profile_id
    into b
    from public.work_tasks wt
   where wt.id = v_blocker;
  if not found or not coalesce((
    b.created_by = uid
    or b.assignee_profile_id = uid
    or public.is_admin()
    or (b.project_id is not null and public.can_manage_project(b.project_id))
  ), false) then
    return 'not_found';
  end if;

  if t.project_id is not null and b.project_id is not null then
    select pr.organization_id into v_blocked_org
      from public.projects pr where pr.id = t.project_id;
    select pr.organization_id into v_blocker_org
      from public.projects pr where pr.id = b.project_id;
    if v_blocked_org is distinct from v_blocker_org then
      return 'invalid';
    end if;
  end if;

  if (select count(*) from public.task_dependencies td
       where td.blocked_task_id = v_blocked) >= 50 then
    return 'limit_reached';
  end if;

  with recursive up as (
    select td.blocker_task_id as tid, 1 as depth
      from public.task_dependencies td
     where td.blocked_task_id = v_blocker
    union all
    select td.blocker_task_id, up.depth + 1
      from public.task_dependencies td
      join up on td.blocked_task_id = up.tid
     where up.depth < 100
  )
  select
    bool_or(tid = v_blocked),
    bool_or(depth >= 100)
    into v_cycle, v_depth_hit
    from up;
  if coalesce(v_cycle, false) then
    return 'cycle';
  end if;
  if coalesce(v_depth_hit, false) then
    return 'limit_reached';
  end if;

  insert into public.task_dependencies
    (blocker_task_id, blocked_task_id, created_by)
  values (v_blocker, v_blocked, uid)
  on conflict (blocker_task_id, blocked_task_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    insert into public.work_task_events
      (task_id, actor_profile_id, action, before_state, after_state)
    values
      (v_blocked, uid, 'dependency_added', null,
       jsonb_build_object('blocker_task_id', v_blocker));
  end if;

  return 'created';
exception
  when invalid_text_representation then
    return 'invalid';
end $$;

revoke all on function public.add_work_task_dependency_v1(text, text) from public;
revoke all on function public.add_work_task_dependency_v1(text, text) from anon;
grant execute on function public.add_work_task_dependency_v1(text, text) to authenticated;

-- ── unlink_journal_entry_from_task_v1(text, text) ─────
create or replace function public.unlink_journal_entry_from_task_v1(
  p_link_id text,
  p_reason  text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_link  uuid := nullif(trim(coalesce(p_link_id, '')), '')::uuid;
  v_why   text := nullif(trim(coalesce(p_reason, '')), '');
  l       record;
  t       record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_link is null then
    return 'invalid';
  end if;
  if v_why is not null and char_length(v_why) > 500 then
    return 'invalid';
  end if;

  select jet.id, jet.entry_id, jet.task_id, jet.linked_by, jet.unlinked_at
    into l
    from public.journal_entry_tasks jet
   where jet.id = v_link
   for update;
  if not found or not public.can_read_journal_entry_v1(l.entry_id) then
    return 'not_found';
  end if;
  if l.unlinked_at is not null then
    return 'already_unlinked';
  end if;

  select wt.project_id, wt.created_by into t
    from public.work_tasks wt where wt.id = l.task_id;
  if not coalesce((
    l.linked_by = uid
    or public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
    or (t.project_id is null and t.created_by = uid)
  ), false) then
    return 'not_allowed';
  end if;

  update public.journal_entry_tasks
     set unlinked_at = now(), unlinked_by = uid, unlink_reason = v_why
   where id = v_link;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'journal_entry_task_unlinked', 'journal_entry_tasks', l.entry_id,
          jsonb_build_object('task_id', l.task_id, 'reason', v_why));

  return 'ok';
end;
$$;

revoke all on function public.unlink_journal_entry_from_task_v1(text, text) from public;
revoke all on function public.unlink_journal_entry_from_task_v1(text, text) from anon;
grant execute on function public.unlink_journal_entry_from_task_v1(text, text) to authenticated;

-- ── start_workflow_instance_v1(text, text, jsonb, text) ─────
create or replace function public.start_workflow_instance_v1(
  p_definition_id     text,
  p_title             text,
  p_payload           jsonb,
  p_context_entity_id text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_def_id  uuid;
  v_ctx_id  uuid;
  v_title   text := nullif(trim(coalesce(p_title, '')), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_def     record;
  v_ver     record;
  v_step    record;
  v_inst    uuid;
  v_step_id uuid;
  v_n       int;
  v_task    record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_def_id := nullif(trim(coalesce(p_definition_id, '')), '')::uuid;
    v_ctx_id := nullif(trim(coalesce(p_context_entity_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_def_id is null then return 'invalid'; end if;
  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 160 then
    return 'invalid';
  end if;
  if jsonb_typeof(v_payload) <> 'object' or pg_column_size(v_payload) > 8192 then
    return 'invalid';
  end if;

  select d.id, d.organization_id, d.context_entity_type, d.is_active
    into v_def
    from public.workflow_definitions d
   where d.id = v_def_id;
  if v_def.id is null
     or not (public.belongs_to_organization(v_def.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if not v_def.is_active then return 'not_found'; end if;

  if v_def.context_entity_type = 'work_task' then
    if v_ctx_id is null then return 'invalid'; end if;

    select wt.id, wt.title, wt.created_by, wt.assignee_profile_id,
           wt.project_id, wt.object_id
      into v_task
      from public.work_tasks wt
     where wt.id = v_ctx_id;

    if v_task.id is null or not coalesce((
         v_task.created_by = uid
         or v_task.assignee_profile_id = uid
         or public.is_admin()
         or (v_task.project_id is not null and public.can_manage_project(v_task.project_id))
       ), false) then
      return 'not_found';
    end if;

    if not exists (
      select 1
        from public.work_tasks wt
        left join public.projects pr     on pr.id = wt.project_id
        left join public.work_objects wo on wo.id = wt.object_id
       where wt.id = v_ctx_id
         and (pr.organization_id = v_def.organization_id
              or wo.organization_id = v_def.organization_id)
         and coalesce(pr.organization_id, v_def.organization_id) = v_def.organization_id
         and coalesce(wo.organization_id, v_def.organization_id) = v_def.organization_id
    ) then
      return 'not_allowed';
    end if;

    v_title := left(btrim(v_task.title), 160);
    if v_title is null or char_length(v_title) < 3 then return 'invalid'; end if;
  end if;

  select v.id into v_ver
    from public.workflow_definition_versions v
   where v.definition_id = v_def.id and v.published_at is not null
   order by v.version desc
   limit 1;
  if v_ver.id is null then return 'not_published'; end if;

  if v_ctx_id is not null and exists (
    select 1 from public.workflow_instances i
     where i.context_entity_type = v_def.context_entity_type
       and i.context_entity_id = v_ctx_id
       and i.status = 'pending'
  ) then
    return 'already_pending';
  end if;

  if (select count(*) from public.workflow_instances i
       where i.requester_profile_id = uid and i.status = 'pending') >= 100 then
    return 'limit_reached';
  end if;

  for v_step in
    select s.step_order, s.approver_rule
      from public.workflow_version_steps s
     where s.version_id = v_ver.id
     order by s.step_order
  loop
    select count(*) into v_n
      from public.workflow_resolve_step_approvers_v1(v_def.organization_id, uid, v_step.approver_rule);
    if v_n = 0 then
      return 'no_approvers';
    end if;
  end loop;

  begin
    insert into public.workflow_instances
      (version_id, organization_id, context_entity_type, context_entity_id,
       requester_profile_id, title, payload, status, current_step_order)
    values
      (v_ver.id, v_def.organization_id, v_def.context_entity_type, v_ctx_id,
       uid, v_title, v_payload, 'pending', 1)
    returning id into v_inst;
  exception when unique_violation then
    return 'already_pending';
  end;

  for v_step in
    select s.step_order, s.name, s.approval_mode, s.approver_rule, s.deadline_hours
      from public.workflow_version_steps s
     where s.version_id = v_ver.id
     order by s.step_order
  loop
    insert into public.workflow_instance_steps
      (instance_id, step_order, name, approval_mode, status, deadline_hours,
       deadline_at, activated_at)
    values
      (v_inst, v_step.step_order, v_step.name, v_step.approval_mode,
       case when v_step.step_order = 1 then 'active' else 'waiting' end,
       v_step.deadline_hours,
       case when v_step.step_order = 1 and v_step.deadline_hours is not null
            then now() + make_interval(hours => v_step.deadline_hours) else null end,
       case when v_step.step_order = 1 then now() else null end)
    returning id into v_step_id;

    insert into public.workflow_instance_approvers
      (instance_step_id, instance_id, approver_profile_id)
    select v_step_id, v_inst, r
      from public.workflow_resolve_step_approvers_v1(v_def.organization_id, uid, v_step.approver_rule) r;
  end loop;

  insert into public.workflow_transitions
    (instance_id, actor_profile_id, action, step_order, from_status, to_status)
  values
    (v_inst, uid, 'started', null, null, 'pending'),
    (v_inst, uid, 'step_activated', 1, null, 'active');

  return v_inst::text;
end;
$$;

revoke all on function public.start_workflow_instance_v1(text, text, jsonb, text) from public;
revoke all on function public.start_workflow_instance_v1(text, text, jsonb, text) from anon;
grant execute on function public.start_workflow_instance_v1(text, text, jsonb, text) to authenticated;

-- ── create_invitation_v1(text, text, text, text, uuid, uuid, text, text, text, text) ─────
create or replace function public.create_invitation_v1(
  p_token_hash      text,
  p_invitation_type text,
  p_invited_email   text,
  p_invited_name    text default null,
  p_organization_id uuid default null,
  p_project_id      uuid default null,
  p_proposed_role   text default null,
  p_personal_message text default null,
  p_locale          text default null,
  p_relationship_slug text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid           uuid := auth.uid();
  v_email       text := lower(nullif(trim(coalesce(p_invited_email, '')), ''));
  v_org_owner   uuid;
  v_open_count  int;
  v_day_count   int;
  v_new         uuid;
  v_rel         text := nullif(trim(coalesce(p_relationship_slug, '')), '');
  v_needs_role  text;
  v_invitable   boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('outcome', 'invalid_token_hash');
  end if;
  if p_invitation_type not in ('join_platform','join_organization','join_team',
      'join_as_employee','collaborate_partner','join_project','invite_company') then
    return jsonb_build_object('outcome', 'invalid_type');
  end if;
  if v_email is null
     or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(v_email) > 254 then
    return jsonb_build_object('outcome', 'invalid_email');
  end if;

  -- Context + sender permission, server-side.
  if p_invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner') then
    if p_organization_id is null then
      return jsonb_build_object('outcome', 'organization_required');
    end if;
    select owner_profile_id into v_org_owner
      from public.organizations where id = p_organization_id;
    if not found then
      return jsonb_build_object('outcome', 'organization_not_found');
    end if;
    if not coalesce((public.is_admin() or v_org_owner = uid
            or public.invitation_org_authority_v1(p_organization_id)), false) then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
  elsif p_invitation_type = 'join_project' then
    if p_project_id is null then
      return jsonb_build_object('outcome', 'project_required');
    end if;
    if not exists (select 1 from public.projects where id = p_project_id) then
      return jsonb_build_object('outcome', 'project_not_found');
    end if;
    if not public.can_manage_project(p_project_id) then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
  end if;

  -- ── NEW: the relationship, when one is named ──────────────────────────────
  -- Absent → the historical per-type default, and this block is inert.
  if v_rel is not null then
    -- Only an organization-scoped invitation establishes a person↔organization
    -- relationship. A platform or project invitation has no organization for
    -- the relationship to be WITH, so naming one is a caller error.
    if p_invitation_type not in
         ('join_organization','join_team','join_as_employee','collaborate_partner') then
      return jsonb_build_object('outcome', 'invalid_relationship');
    end if;

    select rt.invitable, rt.requires_organization_role
      into v_invitable, v_needs_role
      from public.relationship_types rt
     where rt.slug = v_rel and rt.is_active;
    -- Unknown, inactive, or not offerable → refused. Fail-closed: a slug that
    -- nobody deliberately marked invitable is not invitable.
    if not found or not coalesce(v_invitable, false) then
      return jsonb_build_object('outcome', 'invalid_relationship');
    end if;

    -- The capability gate. An organization may only establish a relationship
    -- it has declared it is in the business of: calling someone your student
    -- is a claim about what your organization does.
    if v_needs_role is not null and not exists (
      select 1 from public.organization_roles r
       where r.organization_id = p_organization_id
         and r.role_slug = v_needs_role
    ) then
      return jsonb_build_object('outcome', 'organization_capability_required');
    end if;
  end if;

  -- Abuse caps (per inviter): 100 open, 30 created in the last 24h.
  select count(*) into v_open_count from public.invitations
   where inviter_profile_id = uid and status = 'pending';
  if v_open_count >= 100 then
    return jsonb_build_object('outcome', 'limit_reached');
  end if;
  select count(*) into v_day_count from public.invitations
   where inviter_profile_id = uid and created_at > now() - interval '24 hours';
  if v_day_count >= 30 then
    return jsonb_build_object('outcome', 'rate_limited');
  end if;

  -- One live invitation per (inviter, email, type, context, relationship).
  -- The relationship joins the key: inviting the same person as a learner AND
  -- as an employee are two different offers, and neither should silently
  -- swallow the other.
  if exists (
    select 1 from public.invitations
     where inviter_profile_id = uid
       and lower(invited_email) = v_email
       and invitation_type = p_invitation_type
       and coalesce(organization_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_organization_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(project_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_project_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(relationship_slug, '') = coalesce(v_rel, '')
       and status = 'pending'
       and expires_at > now()
  ) then
    return jsonb_build_object('outcome', 'duplicate_pending');
  end if;

  insert into public.invitations (
    token_hash, invitation_type, organization_id, project_id,
    invited_email, invited_name, proposed_role, personal_message,
    locale, inviter_profile_id, relationship_slug
  ) values (
    p_token_hash, p_invitation_type,
    case when p_invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner')
         then p_organization_id else null end,
    case when p_invitation_type = 'join_project' then p_project_id else null end,
    v_email,
    nullif(trim(coalesce(p_invited_name, '')), ''),
    nullif(trim(coalesce(p_proposed_role, '')), ''),
    nullif(trim(coalesce(p_personal_message, '')), ''),
    case when p_locale ~ '^[a-z]{2}$' then p_locale else null end,
    uid,
    v_rel
  ) returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'create_invitation_v1', 'invitations', v_new,
    jsonb_build_object('invitation_type', p_invitation_type,
      'organization_id', p_organization_id, 'project_id', p_project_id,
      'relationship_slug', v_rel));

  return jsonb_build_object('outcome', 'created', 'invitation_id', v_new);
end $$;

revoke all on function public.create_invitation_v1(text, text, text, text, uuid, uuid, text, text, text, text) from public;
revoke all on function public.create_invitation_v1(text, text, text, text, uuid, uuid, text, text, text, text) from anon;
grant execute on function public.create_invitation_v1(text, text, text, text, uuid, uuid, text, text, text, text) to authenticated;

-- ── create_invitation_v2(text, text, text, text, uuid, uuid, uuid, text, text, text, text, integer, text, integer) ─────
create or replace function public.create_invitation_v2(
  p_token_hash        text,
  p_invitation_type   text,
  p_invited_email     text default null,
  p_invited_name      text default null,
  p_organization_id   uuid default null,
  p_project_id        uuid default null,
  p_target_request_id uuid default null,
  p_proposed_role     text default null,
  p_personal_message  text default null,
  p_locale            text default null,
  p_relationship_slug text default null,
  p_max_uses          integer default 1,
  p_campaign_label    text default null,
  p_expires_in_days   integer default 14
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid           uuid := auth.uid();
  v_email       text := lower(nullif(trim(coalesce(p_invited_email, '')), ''));
  v_org_owner   uuid;
  v_open_count  int;
  v_day_count   int;
  v_new         uuid;
  v_rel         text := nullif(trim(coalesce(p_relationship_slug, '')), '');
  v_needs_role  text;
  v_invitable   boolean;
  v_max         int := coalesce(p_max_uses, 1);
  v_days        int := coalesce(p_expires_in_days, 14);
  v_req_owner   uuid;
  v_req_org     uuid;
  v_req_status  text;
  v_has_context boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('outcome', 'invalid_token_hash');
  end if;
  if p_invitation_type not in ('join_platform','join_organization','join_team',
      'join_as_employee','collaborate_partner','join_project','invite_company',
      'invite_to_demand') then
    return jsonb_build_object('outcome', 'invalid_type');
  end if;
  -- An addressee is optional (open link); when given it must be an address.
  if v_email is not null and (
       v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       or char_length(v_email) > 254) then
    return jsonb_build_object('outcome', 'invalid_email');
  end if;
  if v_max < 1 or v_max > 500 then
    return jsonb_build_object('outcome', 'invalid_max_uses');
  end if;
  if v_days < 1 or v_days > 90 then
    return jsonb_build_object('outcome', 'invalid_expiry');
  end if;

  -- Context + sender permission, server-side.
  v_has_context := false;
  if p_invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner') then
    if p_organization_id is null then
      return jsonb_build_object('outcome', 'organization_required');
    end if;
    select owner_profile_id into v_org_owner
      from public.organizations where id = p_organization_id;
    if not found then
      return jsonb_build_object('outcome', 'organization_not_found');
    end if;
    if not coalesce((public.is_admin() or v_org_owner = uid
            or public.invitation_org_authority_v1(p_organization_id)), false) then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
    v_has_context := true;
  elsif p_invitation_type = 'join_project' then
    if p_project_id is null then
      return jsonb_build_object('outcome', 'project_required');
    end if;
    if not exists (select 1 from public.projects where id = p_project_id) then
      return jsonb_build_object('outcome', 'project_not_found');
    end if;
    if not public.can_manage_project(p_project_id) then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
    v_has_context := true;
  elsif p_invitation_type = 'invite_to_demand' then
    -- THE EMPLOYER FOUND THE PERSON. The target is the canonical demand
    -- object and nothing else; the inviter must own it or manage the
    -- organization it belongs to. A closed need cannot be invited to.
    if p_target_request_id is null then
      return jsonb_build_object('outcome', 'demand_required');
    end if;
    select profile_id, organization_id, status
      into v_req_owner, v_req_org, v_req_status
      from public.customer_requests where id = p_target_request_id;
    if not found then
      return jsonb_build_object('outcome', 'demand_not_found');
    end if;
    if not (public.is_admin() or v_req_owner = uid
            or (v_req_org is not null and public.manages_organization(v_req_org))) then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
    if v_req_status = 'closed' then
      return jsonb_build_object('outcome', 'demand_closed');
    end if;
    v_has_context := true;
  end if;

  -- MULTI-USE IS A CONTEXT PRIVILEGE. A link that 30 people may use belongs
  -- to an organization, a project or a need someone is answerable for. A
  -- plain "invite a colleague" link stays bounded to a crew-sized number.
  if v_max > 1 and not v_has_context and v_max > 20 then
    return jsonb_build_object('outcome', 'invalid_max_uses');
  end if;

  -- The relationship, when one is named (v1 block, unchanged).
  if v_rel is not null then
    if p_invitation_type not in
         ('join_organization','join_team','join_as_employee','collaborate_partner') then
      return jsonb_build_object('outcome', 'invalid_relationship');
    end if;
    select rt.invitable, rt.requires_organization_role
      into v_invitable, v_needs_role
      from public.relationship_types rt
     where rt.slug = v_rel and rt.is_active;
    if not found or not coalesce(v_invitable, false) then
      return jsonb_build_object('outcome', 'invalid_relationship');
    end if;
    if v_needs_role is not null and not exists (
      select 1 from public.organization_roles r
       where r.organization_id = p_organization_id
         and r.role_slug = v_needs_role
    ) then
      return jsonb_build_object('outcome', 'organization_capability_required');
    end if;
  end if;

  -- Abuse caps (per inviter): 100 open, 30 created in the last 24h (v1).
  select count(*) into v_open_count from public.invitations
   where inviter_profile_id = uid and status = 'pending';
  if v_open_count >= 100 then
    return jsonb_build_object('outcome', 'limit_reached');
  end if;
  select count(*) into v_day_count from public.invitations
   where inviter_profile_id = uid and created_at > now() - interval '24 hours';
  if v_day_count >= 30 then
    return jsonb_build_object('outcome', 'rate_limited');
  end if;

  -- One live ADDRESSED invitation per (inviter, email, type, context,
  -- relationship) — v1 rule; an open link has no addressee to collide on.
  if v_email is not null and exists (
    select 1 from public.invitations
     where inviter_profile_id = uid
       and lower(invited_email) = v_email
       and invitation_type = p_invitation_type
       and coalesce(organization_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_organization_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(project_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_project_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(target_request_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_target_request_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(relationship_slug, '') = coalesce(v_rel, '')
       and status = 'pending'
       and expires_at > now()
  ) then
    return jsonb_build_object('outcome', 'duplicate_pending');
  end if;

  insert into public.invitations (
    token_hash, invitation_type, organization_id, project_id, target_request_id,
    invited_email, invited_name, proposed_role, personal_message,
    locale, inviter_profile_id, relationship_slug,
    max_uses, campaign_label, expires_at
  ) values (
    p_token_hash, p_invitation_type,
    case when p_invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner')
         then p_organization_id else null end,
    case when p_invitation_type = 'join_project' then p_project_id else null end,
    case when p_invitation_type = 'invite_to_demand' then p_target_request_id else null end,
    v_email,
    nullif(trim(coalesce(p_invited_name, '')), ''),
    nullif(trim(coalesce(p_proposed_role, '')), ''),
    nullif(trim(coalesce(p_personal_message, '')), ''),
    case when p_locale ~ '^[a-z]{2}$' then p_locale else null end,
    uid,
    v_rel,
    v_max,
    nullif(trim(coalesce(p_campaign_label, '')), ''),
    now() + make_interval(days => v_days)
  ) returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'create_invitation_v2', 'invitations', v_new,
    jsonb_build_object('invitation_type', p_invitation_type,
      'organization_id', p_organization_id, 'project_id', p_project_id,
      'target_request_id', p_target_request_id,
      'relationship_slug', v_rel, 'max_uses', v_max,
      'addressed', v_email is not null));

  return jsonb_build_object('outcome', 'created', 'invitation_id', v_new);
end $$;

revoke all on function public.create_invitation_v2(text, text, text, text, uuid, uuid, uuid, text, text, text, text, integer, text, integer) from public;
revoke all on function public.create_invitation_v2(text, text, text, text, uuid, uuid, uuid, text, text, text, text, integer, text, integer) from anon;
grant execute on function public.create_invitation_v2(text, text, text, text, uuid, uuid, uuid, text, text, text, text, integer, text, integer) to authenticated;

commit;
