-- ROLLBACK for 20261002150000_work_tasks_stage_and_subtask_v1.sql
--
-- REFUSES while ANY task holds a stage or a parent: those rows are real
-- planning structure a user created, and dropping the columns would silently
-- delete it. After real use the correct move is a FORWARD FIX.
--
-- With zero such rows it restores the prior state exactly:
--   * drops the NEW 9-arg create_work_task_v2 and 8-arg update_work_task_v2
--     and RE-CREATES the two ORIGINAL signatures verbatim (from
--     20260817151000_work_tasks_v2_collaboration.sql) with their original grants;
--   * drops set_project_stage_responsible_v1, the structure helper, the
--     integrity trigger + its function, the two indexes and the two columns.
-- project_stages.responsible_engagement_id is a PRE-EXISTING column
-- (20260718140000) and is left untouched.

begin;

do $$
declare
  n_struct bigint;
begin
  select count(*) into n_struct
    from public.work_tasks
   where stage_id is not null or parent_task_id is not null;
  if n_struct > 0 then
    raise exception
      'work_tasks stage/subtask rollback refused: % task(s) carry a stage or parent — forward-fix instead',
      n_struct;
  end if;
end $$;

drop function if exists public.set_project_stage_responsible_v1(uuid, uuid);
drop function if exists public.update_work_task_v2(text, text, text, text, text, text, text, text);
drop function if exists public.create_work_task_v2(text, text, text, text, text, text, text, text, text);

drop trigger if exists trg_work_tasks_structure_guard on public.work_tasks;
drop function if exists public.work_tasks_structure_guard_v1();
drop function if exists public.work_task_structure_check_v1(uuid, uuid, uuid, uuid, uuid);

drop index if exists public.wt_parent_idx;
drop index if exists public.wt_stage_idx;

alter table public.work_tasks drop column if exists parent_task_id;
alter table public.work_tasks drop column if exists stage_id;

-- ── Original create_work_task_v2 (verbatim, 20260817151000 §5) ─────────────
create or replace function public.create_work_task_v2(
  p_title               text,
  p_description         text,
  p_priority            text,
  p_due_date            text,
  p_project_id          text,
  p_object_id           text,
  p_assignee_profile_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_title    text := nullif(trim(coalesce(p_title, '')), '');
  v_desc     text := nullif(trim(coalesce(p_description, '')), '');
  v_prio     text := nullif(trim(coalesce(p_priority, '')), '');
  v_due      date;
  v_project  uuid := nullif(trim(coalesce(p_project_id, '')), '')::uuid;
  v_object   uuid := nullif(trim(coalesce(p_object_id, '')), '')::uuid;
  v_assignee uuid := nullif(trim(coalesce(p_assignee_profile_id, '')), '')::uuid;
  v_proj_org uuid;
  v_obj_org  uuid;
  v_obj_status text;
  v_new_id   uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
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

  -- Project authority — the v1 rule, re-checked in the definer.
  if v_project is not null then
    if not public.can_manage_project(v_project) then
      return 'not_allowed';
    end if;
    select pr.organization_id into v_proj_org
      from public.projects pr where pr.id = v_project;
  end if;

  -- Assign-to-other is a MANAGING act on a project task; self-assign is
  -- always allowed (the v1 behaviour, kept).
  if v_assignee is not null and v_assignee <> uid then
    if v_project is null then
      return 'invalid_assignee';
    end if;
    -- can_manage_project already held above; now the TARGET must be real:
    if not public.work_task_assignee_eligible_v1(v_assignee, v_proj_org) then
      return 'invalid_assignee';
    end if;
  end if;

  -- Object link: the object must exist, be ACTIVE, and belong to the same
  -- organization as the project (when both are set) or to an organization
  -- the caller has a real relationship with (personal tasks).
  if v_object is not null then
    select wo.organization_id, wo.status into v_obj_org, v_obj_status
      from public.work_objects wo where wo.id = v_object;
    if v_obj_org is null or v_obj_status <> 'active' then
      return 'invalid_object';
    end if;
    if v_project is not null then
      if v_proj_org is null or v_obj_org <> v_proj_org then
        return 'invalid_object';
      end if;
    elsif not (public.is_org_member_or_engaged_v1(v_obj_org)
               or public.has_org_demand_access(v_obj_org)
               or public.is_admin()) then
      return 'invalid_object';
    end if;
  end if;

  -- The v1 abuse cap, unchanged.
  if (select count(*) from public.work_tasks wt
       where wt.created_by = uid
         and wt.status in ('todo','in_progress','blocked')) >= 200 then
    return 'task_limit_reached';
  end if;

  insert into public.work_tasks
    (project_id, object_id, title, description, status, priority,
     assignee_profile_id, created_by, due_at)
  values
    (v_project, v_object, v_title, v_desc, 'todo', v_prio,
     v_assignee, uid,
     case when v_due is null then null else v_due::timestamptz end)
  returning id into v_new_id;

  -- SUCCESS returns the NEW TASK ID as text (the assign_worker_to_project
  -- returns-uuid precedent, kept in the outcome-string channel so soft
  -- failures stay words): the caller needs the id to emit the durable
  -- assignment notification for the exact row that was created.
  return v_new_id::text;
exception
  when invalid_text_representation or datetime_field_overflow then
    return 'invalid';
end $$;

revoke all on function public.create_work_task_v2(text, text, text, text, text, text, text) from public;
revoke all on function public.create_work_task_v2(text, text, text, text, text, text, text) from anon;
grant execute on function public.create_work_task_v2(text, text, text, text, text, text, text) to authenticated;

-- ── Original update_work_task_v2 (verbatim, 20260817151000 §7) ─────────────
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
  -- The v1 edit-authority set, unchanged: creator / assignee / admin /
  -- manager of the linked project.
  if not (
    t.created_by = uid
    or t.assignee_profile_id = uid
    or public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
  ) then
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

-- ── Original link_journal_entry_to_task_v1 (verbatim, 20260819190000 §4) ───
-- (same signature, so create-or-replace puts the v1 body back; grants
-- re-asserted as in the original.)
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

  -- The ENTRY must be visible to the caller.
  select je.id, je.worker_id, je.engagement_context_id, je.deleted_at, je.superseded_by
    into e
    from public.journal_entries je
   where je.id = v_entry;
  if not found or not public.can_read_journal_entry_v1(v_entry) then
    return 'not_found';
  end if;
  -- Withdrawn evidence cannot be presented as proof of work.
  if e.deleted_at is not null or e.superseded_by is not null then
    return 'entry_not_current';
  end if;

  -- The TASK must be visible to the caller (the v1 wt_select predicate).
  select wt.id, wt.project_id, wt.created_by, wt.assignee_profile_id, wt.status
    into t
    from public.work_tasks wt
   where wt.id = v_task;
  if not found or not (
    t.created_by = uid
    or t.assignee_profile_id = uid
    or public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
  ) then
    return 'not_found';
  end if;

  -- Bounded: a task collects a readable evidence list, not a dump.
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
    -- Already linked — idempotent, not an error.
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

commit;
