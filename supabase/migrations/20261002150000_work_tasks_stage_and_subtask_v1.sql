-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- @human-gate-approved — RED by construction (SECURITY DEFINER functions +
-- GRANT/REVOKE + a trigger). Safety class: ADDITIVE schema (two nullable
-- columns on work_tasks, two partial indexes, one integrity trigger, one
-- internal helper, one new setter RPC) + REPLACEMENT of two existing RPC
-- signatures with the SAME name/authority and two extra OPTIONAL parameters.
-- The annotation states the ROUTE, not the decision.
--
-- 20261002150000 — PROJECT → STAGE → TASK → SUBTASK on the EXISTING model.
--
-- PROBLEM. work_tasks (20260711210000 / v2 20260817151000) is flat and knows
-- no stage; project_stages (20260718140000) has a responsible_engagement_id
-- column with no setter. A project cannot express "stage 1 has tasks 1.1 and
-- 1.2, task 1.2 has subtasks" without a second engine.
--
-- SOLUTION (no new engine, nothing stored that can be derived):
--   1. work_tasks.stage_id        nullable FK project_stages(id) ON DELETE SET NULL
--   2. work_tasks.parent_task_id  nullable FK work_tasks(id)     ON DELETE NO ACTION
--        (NO ACTION == RESTRICT semantics for a lone parent delete, but is
--         checked at end of statement, so a project delete that cascades to
--         BOTH parent and child rows is not blocked mid-cascade.)
--   3. work_tasks_structure_guard_v1 trigger (integrity of last resort; every
--      write path is an RPC, direct writes stay REVOKEd): stage belongs to the
--      task's project; parent is in the same project; no self-parent, no cycle;
--      depth cap 3 (task 1 → subtask 2 → sub-subtask 3) INCLUDING the moved
--      subtree's height; a child's stage is NULL or equals its parent's stage.
--   4. work_task_structure_check_v1 (internal helper, no grants) — the SAME
--      validation, returning an outcome WORD so the RPCs can answer in the
--      existing outcome-string channel.
--   5. create_work_task_v2 / update_work_task_v2 gain OPTIONAL p_stage_id /
--      p_parent_task_id (default null). The old signatures are DROPPED and
--      re-created: two overloads with defaults would make named-argument
--      calls ambiguous. Every existing caller keeps working unchanged
--      (null = "not supplied"). On update, null = unchanged, '' = clear.
--      A subtask INHERITS its parent's stage; re-staging a parent cascades to
--      its descendants. Structure changes need manage authority
--      (can_manage_project / admin; the creator for a personal task) — the
--      create path already required it for project tasks.
--   6. set_project_stage_responsible_v1(stage, engagement) — the missing
--      setter for project_stages.responsible_engagement_id, gated by
--      can_manage_project; the engagement must be ACTIVE in the project's own
--      organization. NULL clears.
--
-- ATTRIBUTION (owner-approved addition): stored facts stay ONE PER LEVEL —
-- PROJECT = journal_entries.project_id, TASK = a live journal_entry_tasks row,
-- STAGE = work_tasks.stage_id, OBJECT = work_tasks.object_id. An entry's stage
-- and object are DERIVED through its single live linked task; nothing is added
-- to journal_entries and no project_objects table exists.
--   7. link_journal_entry_to_task_v1 (same signature, CREATE OR REPLACE):
--      + refuses project_mismatch / organization_mismatch; an entry with NO
--      project may link only to a project its worker is ACTIVELY assigned to.
--      All v1 checks, limits, idempotency, audit and grants are kept.
--   8. Task-side guards: an object pinned to ANOTHER project is refused on
--      create/update; the trigger refuses re-pointing task.project_id, and
--      update_work_task_v2 refuses re-staging (own subtree included), while
--      LIVE journal evidence exists ('evidence_linked' → unlink/relink first).
--   LEGACY: links that already violate this are NOT rewritten (no invented
--   history). The app flags them 'attribution conflict' and never counts
--   them toward a stage/object roll-up; roll-ups count only entries with
--   exactly one live task link; project entries with no task are
--   'project-level, unstaged', never guessed into a stage.
--
-- WBS NUMBERS AND PROGRESS ARE NOT STORED. '1', '1.1', '1.2.1' are derived in
-- the app (lib/projects/wbs.ts) from stage_order + sibling order; progress /
-- stage-status suggestions are derived read-only. Nothing is backfilled.
--
-- GRANTS: identical to the latest applied definitions —
--   create_work_task_v2 / update_work_task_v2 / set_project_stage_responsible_v1:
--     revoke all from public, anon; grant execute to authenticated.
--   work_task_structure_check_v1 / trigger function: revoke all from public,
--     anon, authenticated (internal only). No anon path anywhere.
-- RLS: NO policy is created, altered or dropped. work_tasks keeps `wt_select`
-- and no write policy; project_stages keeps `project_stages_select`.
--
-- ROLLBACK: supabase/rollbacks/20261002150000_work_tasks_stage_and_subtask_v1.down.sql
-- REFUSES while any task holds a stage or parent (forward-fix instead);
-- otherwise it restores the two original RPCs verbatim and removes the rest.
-- ============================================================================

begin;

-- ── 1. Columns + indexes ────────────────────────────────────────────────────
alter table public.work_tasks
  add column if not exists stage_id uuid
    references public.project_stages(id) on delete set null,
  add column if not exists parent_task_id uuid
    references public.work_tasks(id) on delete no action;

create index if not exists wt_stage_idx
  on public.work_tasks (stage_id)
  where stage_id is not null;
create index if not exists wt_parent_idx
  on public.work_tasks (parent_task_id)
  where parent_task_id is not null;

-- ── 2. Integrity trigger (defence in depth; RPCs validate first) ───────────
create or replace function public.work_tasks_structure_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage_project uuid;
  par             record;
  v_up_depth      integer;
  v_up_cycle      boolean;
  v_down_height   integer;
begin
  -- A task's project is the anchor of every journal entry linked to it
  -- (project = entry.project_id, stage/object are DERIVED through the live
  -- link). Re-pointing it while live evidence exists would silently
  -- re-attribute real work: refuse; unlink or relink the evidence first.
  if tg_op = 'UPDATE' then
    if new.project_id is distinct from old.project_id
       and exists (
         select 1 from public.journal_entry_tasks jet
          where jet.task_id = new.id and jet.unlinked_at is null
       ) then
      raise exception 'work_task_has_live_evidence' using errcode = '23514';
    end if;
  end if;

  if new.stage_id is null and new.parent_task_id is null then
    return new;
  end if;

  if new.stage_id is not null then
    select ps.project_id into v_stage_project
      from public.project_stages ps where ps.id = new.stage_id;
    if v_stage_project is null
       or new.project_id is null
       or v_stage_project <> new.project_id then
      raise exception 'work_task_stage_project_mismatch' using errcode = '23514';
    end if;
  end if;

  if new.parent_task_id is not null then
    if new.parent_task_id = new.id then
      raise exception 'work_task_self_parent' using errcode = '23514';
    end if;
    select wt.id, wt.project_id, wt.stage_id into par
      from public.work_tasks wt where wt.id = new.parent_task_id;
    if not found then
      raise exception 'work_task_parent_missing' using errcode = '23503';
    end if;
    if par.project_id is distinct from new.project_id then
      raise exception 'work_task_parent_project_mismatch' using errcode = '23514';
    end if;
    -- A child's stage is NULL or exactly its parent's stage.
    if new.stage_id is not null and new.stage_id is distinct from par.stage_id then
      raise exception 'work_task_child_stage_mismatch' using errcode = '23514';
    end if;

    with recursive up(id, parent_id, d) as (
      select wt.id, wt.parent_task_id, 1
        from public.work_tasks wt where wt.id = new.parent_task_id
      union all
      select w.id, w.parent_task_id, up.d + 1
        from public.work_tasks w join up on w.id = up.parent_id
       where up.d < 10
    )
    select max(d), coalesce(bool_or(id = new.id), false)
      into v_up_depth, v_up_cycle from up;
    if v_up_cycle then
      raise exception 'work_task_parent_cycle' using errcode = '23514';
    end if;

    with recursive down(id, d) as (
      select wt.id, 1 from public.work_tasks wt where wt.parent_task_id = new.id
      union all
      select w.id, down.d + 1
        from public.work_tasks w join down on w.parent_task_id = down.id
       where down.d < 10
    )
    select coalesce(max(d), 0) into v_down_height from down;

    if coalesce(v_up_depth, 0) + 1 + v_down_height > 3 then
      raise exception 'work_task_depth_exceeded' using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

revoke all on function public.work_tasks_structure_guard_v1() from public;
revoke all on function public.work_tasks_structure_guard_v1() from anon;
revoke all on function public.work_tasks_structure_guard_v1() from authenticated;

drop trigger if exists trg_work_tasks_structure_guard on public.work_tasks;
create trigger trg_work_tasks_structure_guard
  before insert or update of stage_id, parent_task_id, project_id
  on public.work_tasks
  for each row execute function public.work_tasks_structure_guard_v1();

-- ── 3. Internal validation helper — returns an outcome WORD ────────────────
-- p_stage  : the EXPLICITLY requested stage (null = none requested)
-- p_parent : the (new) parent (null = none)
-- p_self   : the task being moved (null on create)
create or replace function public.work_task_structure_check_v1(
  p_project uuid,
  p_stage   uuid,
  p_parent  uuid,
  p_self    uuid,
  p_actor   uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  par           record;
  v_up_depth    integer;
  v_up_cycle    boolean;
  v_down_height integer := 0;
begin
  if p_stage is not null then
    if p_project is null then
      return 'invalid_stage';
    end if;
    if not exists (
      select 1 from public.project_stages ps
       where ps.id = p_stage and ps.project_id = p_project
    ) then
      return 'invalid_stage';
    end if;
  end if;

  if p_parent is not null then
    if p_self is not null and p_parent = p_self then
      return 'cycle';
    end if;
    select wt.id, wt.project_id, wt.stage_id, wt.created_by into par
      from public.work_tasks wt where wt.id = p_parent;
    if not found then
      return 'invalid_parent';
    end if;
    if par.project_id is distinct from p_project then
      return 'invalid_parent';
    end if;
    -- A personal (project-less) hierarchy is private to its creator.
    if p_project is null and par.created_by is distinct from p_actor
       and not public.is_admin() then
      return 'invalid_parent';
    end if;
    if p_stage is not null and p_stage is distinct from par.stage_id then
      return 'invalid_stage';
    end if;

    with recursive up(id, parent_id, d) as (
      select wt.id, wt.parent_task_id, 1
        from public.work_tasks wt where wt.id = p_parent
      union all
      select w.id, w.parent_task_id, up.d + 1
        from public.work_tasks w join up on w.id = up.parent_id
       where up.d < 10
    )
    select max(d), coalesce(bool_or(id = p_self), false)
      into v_up_depth, v_up_cycle from up;
    if v_up_cycle then
      return 'cycle';
    end if;

    if p_self is not null then
      with recursive down(id, d) as (
        select wt.id, 1 from public.work_tasks wt where wt.parent_task_id = p_self
        union all
        select w.id, down.d + 1
          from public.work_tasks w join down on w.parent_task_id = down.id
         where down.d < 10
      )
      select coalesce(max(d), 0) into v_down_height from down;
    end if;

    if coalesce(v_up_depth, 0) + 1 + v_down_height > 3 then
      return 'depth_exceeded';
    end if;
  end if;

  return 'ok';
end $$;

revoke all on function public.work_task_structure_check_v1(uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function public.work_task_structure_check_v1(uuid, uuid, uuid, uuid, uuid) from anon;
revoke all on function public.work_task_structure_check_v1(uuid, uuid, uuid, uuid, uuid) from authenticated;

-- ── 4. create_work_task_v2 — + optional stage / parent ──────────────────────
drop function if exists public.create_work_task_v2(text, text, text, text, text, text, text);

create or replace function public.create_work_task_v2(
  p_title               text,
  p_description         text,
  p_priority            text,
  p_due_date            text,
  p_project_id          text,
  p_object_id           text,
  p_assignee_profile_id text,
  p_stage_id            text default null,
  p_parent_task_id      text default null
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
  v_stage    uuid := nullif(trim(coalesce(p_stage_id, '')), '')::uuid;
  v_parent   uuid := nullif(trim(coalesce(p_parent_task_id, '')), '')::uuid;
  v_check    text;
  v_proj_org uuid;
  v_obj_org  uuid;
  v_obj_status text;
  v_obj_project uuid;
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
    select wo.organization_id, wo.status, wo.project_id
      into v_obj_org, v_obj_status, v_obj_project
      from public.work_objects wo where wo.id = v_object;
    if v_obj_org is null or v_obj_status <> 'active' then
      return 'invalid_object';
    end if;
    if v_project is not null then
      if v_proj_org is null or v_obj_org <> v_proj_org then
        return 'invalid_object';
      end if;
      -- NEW: an object pinned to ANOTHER project cannot carry this task.
      if v_obj_project is not null and v_obj_project <> v_project then
        return 'invalid_object';
      end if;
    elsif not (public.is_org_member_or_engaged_v1(v_obj_org)
               or public.has_org_demand_access(v_obj_org)
               or public.is_admin()) then
      return 'invalid_object';
    end if;
  end if;

  -- Stage / parent (NEW, optional). Same-project, no cycle, depth cap; a
  -- subtask inherits its parent's stage.
  if v_stage is not null or v_parent is not null then
    v_check := public.work_task_structure_check_v1(v_project, v_stage, v_parent, null, uid);
    if v_check <> 'ok' then
      return v_check;
    end if;
    if v_parent is not null then
      select wt.stage_id into v_stage from public.work_tasks wt where wt.id = v_parent;
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
     assignee_profile_id, created_by, due_at, stage_id, parent_task_id)
  values
    (v_project, v_object, v_title, v_desc, 'todo', v_prio,
     v_assignee, uid,
     case when v_due is null then null else v_due::timestamptz end,
     v_stage, v_parent)
  returning id into v_new_id;

  -- SUCCESS returns the NEW TASK ID as text (unchanged contract).
  return v_new_id::text;
exception
  when invalid_text_representation or datetime_field_overflow then
    return 'invalid';
end $$;

revoke all on function public.create_work_task_v2(text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.create_work_task_v2(text, text, text, text, text, text, text, text, text) from anon;
grant execute on function public.create_work_task_v2(text, text, text, text, text, text, text, text, text) to authenticated;

-- ── 5. update_work_task_v2 — + optional stage / parent ──────────────────────
-- p_stage_id / p_parent_task_id: NULL = unchanged, '' = clear, uuid = set.
drop function if exists public.update_work_task_v2(text, text, text, text, text, text);

create or replace function public.update_work_task_v2(
  p_task_id        text,
  p_title          text,
  p_description    text,
  p_priority       text,
  p_due_date       text,
  p_object_id      text,
  p_stage_id       text default null,
  p_parent_task_id text default null
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
  v_obj_project uuid;
  v_req_stage  uuid := nullif(trim(coalesce(p_stage_id, '')), '')::uuid;
  v_req_parent uuid := nullif(trim(coalesce(p_parent_task_id, '')), '')::uuid;
  v_new_stage  uuid;
  v_new_parent uuid;
  v_check      text;
  v_level      integer;
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

  select wt.id, wt.project_id, wt.created_by, wt.assignee_profile_id,
         wt.stage_id, wt.parent_task_id
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
    or t.assignee_profile_id is not distinct from uid  -- null-safe: a NULL assignee must not make `not (...)` NULL
    or public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
  ) then
    return 'not_found';
  end if;

  if v_object is not null then
    select wo.organization_id, wo.status, wo.project_id
      into v_obj_org, v_obj_status, v_obj_project
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
      -- NEW: an object pinned to ANOTHER project cannot carry this task.
      if v_obj_project is not null and v_obj_project <> t.project_id then
        return 'invalid_object';
      end if;
    elsif not (public.is_org_member_or_engaged_v1(v_obj_org)
               or public.has_org_demand_access(v_obj_org)
               or public.is_admin()) then
      return 'invalid_object';
    end if;
  end if;

  -- Stage / parent change (NEW, optional). Re-structuring is a MANAGING act:
  -- admin, manager of the project, or the creator of a personal task.
  v_new_stage  := t.stage_id;
  v_new_parent := t.parent_task_id;
  if p_stage_id is not null or p_parent_task_id is not null then
    if not (
      public.is_admin()
      or (t.project_id is not null and public.can_manage_project(t.project_id))
      or (t.project_id is null and t.created_by = uid)
    ) then
      return 'not_allowed';
    end if;

    if p_parent_task_id is not null then
      v_new_parent := v_req_parent;
    end if;

    v_check := public.work_task_structure_check_v1(
      t.project_id,
      case when p_stage_id is not null then v_req_stage else null end,
      v_new_parent,
      v_task,
      uid
    );
    if v_check <> 'ok' then
      return v_check;
    end if;

    if v_new_parent is not null then
      -- A subtask always carries its parent's stage.
      select wt.stage_id into v_new_stage
        from public.work_tasks wt where wt.id = v_new_parent;
    elsif p_stage_id is not null then
      v_new_stage := v_req_stage;
    end if;
  end if;

  -- Re-staging a task (or its subtree) that has LIVE journal evidence would
  -- silently move that evidence to another stage (an entry's stage is derived
  -- through its linked task). Require unlink/relink first.
  if v_new_stage is distinct from t.stage_id and exists (
    with recursive sub(id, d) as (
      select v_task, 0
      union all
      select w.id, sub.d + 1
        from public.work_tasks w join sub on w.parent_task_id = sub.id
       where sub.d < 4
    )
    select 1 from public.journal_entry_tasks jet
      join sub on sub.id = jet.task_id
     where jet.unlinked_at is null
  ) then
    return 'evidence_linked';
  end if;

  update public.work_tasks wt
     set title          = v_title,
         description    = v_desc,
         priority       = v_prio,
         due_at         = case when v_due is null then null else v_due::timestamptz end,
         object_id      = v_object,
         stage_id       = v_new_stage,
         parent_task_id = v_new_parent,
         updated_at     = now()
   where wt.id = v_task;

  -- Re-staging a parent carries its descendants with it, one level per
  -- statement (the depth cap is 3, so at most two further levels).
  if v_new_stage is distinct from t.stage_id then
    for v_level in 1..2 loop
      update public.work_tasks c
         set stage_id = v_new_stage,
             updated_at = now()
        from public.work_tasks p
       where c.parent_task_id = p.id
         and p.stage_id is not distinct from v_new_stage
         and c.stage_id is distinct from v_new_stage;
    end loop;
  end if;

  return 'updated';
exception
  when invalid_text_representation or datetime_field_overflow then
    return 'invalid';
end $$;

revoke all on function public.update_work_task_v2(text, text, text, text, text, text, text, text) from public;
revoke all on function public.update_work_task_v2(text, text, text, text, text, text, text, text) from anon;
grant execute on function public.update_work_task_v2(text, text, text, text, text, text, text, text) to authenticated;

-- ── 6. set_project_stage_responsible_v1 — the missing setter ───────────────
create or replace function public.set_project_stage_responsible_v1(
  p_stage_id      uuid,
  p_engagement_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project uuid;
begin
  select ps.project_id into v_project
    from public.project_stages ps where ps.id = p_stage_id;
  if v_project is null then
    raise exception 'stage not found';
  end if;
  if not public.can_manage_project(v_project) then
    raise exception 'not authorized to manage this project';
  end if;
  -- The responsible party must be ACTIVE in the project's OWN organization.
  if p_engagement_id is not null and not exists (
    select 1
      from public.engagement_contexts ec
      join public.projects pr on pr.id = v_project
     where ec.id = p_engagement_id
       and ec.organization_id = pr.organization_id
       and ec.status = 'active'
  ) then
    raise exception 'responsible engagement does not belong to this project organization';
  end if;
  update public.project_stages
     set responsible_engagement_id = p_engagement_id,
         updated_at = now()
   where id = p_stage_id;
end $$;

-- ── 7. link_journal_entry_to_task_v1 — attribution consistency ─────────────
-- Stored facts stay ONE PER LEVEL: PROJECT = journal_entries.project_id,
-- TASK = a live journal_entry_tasks row, STAGE = work_tasks.stage_id,
-- OBJECT = work_tasks.object_id. An entry's stage/object are DERIVED through
-- its single live linked task — never stored on the entry.
--
-- The v1 definition (20260819190000) did not compare the entry's project or
-- organization with the task's, so evidence could be linked across projects.
-- Same signature → CREATE OR REPLACE (grants re-asserted, identical). Every
-- existing check, limit, idempotency rule and audit row is kept verbatim;
-- ONLY the three new refusals are added, answered as outcome words:
--   project_mismatch       task.project differs from entry.project; or the
--                          entry has NO project and the task's project is not
--                          one the entry's worker is ACTIVELY assigned to
--   organization_mismatch  the entry's engagement-context organization
--                          differs from the task's project organization
-- Legacy links that already violate this are NOT rewritten (no invented
-- history); the read models flag them as 'attribution conflict'.
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
  v_task_org uuid;
  v_entry_org uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_entry is null or v_task is null then
    return 'invalid';
  end if;

  -- The ENTRY must be visible to the caller.
  select je.id, je.worker_id, je.engagement_context_id, je.deleted_at,
         je.superseded_by, je.project_id
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
    or t.assignee_profile_id is not distinct from uid  -- null-safe: a NULL assignee must not make `not (...)` NULL
    or public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
  ) then
    return 'not_found';
  end if;

  -- NEW: project consistency.
  if e.project_id is not null then
    if t.project_id is distinct from e.project_id then
      return 'project_mismatch';
    end if;
  elsif t.project_id is not null then
    -- Entry carries no project: allowed only for a project the entry's
    -- worker is actively assigned to (never guessed).
    if not exists (
      select 1 from public.project_worker_assignments pwa
       where pwa.worker_id = e.worker_id
         and pwa.project_id = t.project_id
         and pwa.status = 'active'
    ) then
      return 'project_mismatch';
    end if;
  end if;

  -- NEW: organization consistency (project tasks only; a personal task has
  -- no organization to compare).
  if t.project_id is not null then
    select pr.organization_id into v_task_org
      from public.projects pr where pr.id = t.project_id;
    select ec.organization_id into v_entry_org
      from public.engagement_contexts ec where ec.id = e.engagement_context_id;
    if v_task_org is not null and v_entry_org is distinct from v_task_org then
      return 'organization_mismatch';
    end if;
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

revoke all on function public.set_project_stage_responsible_v1(uuid, uuid) from public;
revoke all on function public.set_project_stage_responsible_v1(uuid, uuid) from anon;
grant execute on function public.set_project_stage_responsible_v1(uuid, uuid) to authenticated;

commit;
