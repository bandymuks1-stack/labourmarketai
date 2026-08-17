-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration by the LEAD session, AFTER
-- 20260817150000_work_objects_v1 (work_tasks.object_id references it).
-- Never `db push`.
--
-- @human-gate-approved — pre-approved by owner mandate 2026-08-17 (autonomous
-- functional completion train V2, §4 migration authority). Safety class:
-- ADDITIVE (one nullable column on work_tasks, two new RLS-bearing tables,
-- one trigger, six new SECURITY DEFINER RPCs; NO existing function, policy,
-- grant or constraint is recreated or dropped). SECURITY DEFINER +
-- GRANT/REVOKE + create trigger are RED-class by construction; the
-- annotation states the ROUTE, not the decision.
--
-- 20260817151000 — work_tasks v2 collaboration: assign-to-other, object
-- link, dependencies, gated reopen and an append-only task history
-- (full-reality audit 2026-08-17, WORK section: "task FULL entity —
-- assignment SELF-ONLY", "journal/task history absent").
--
-- PROBLEM: work_tasks v1 (APPLIED, 20260711210000) deliberately shipped
-- self-assign-only writes, no site link, no ordering between tasks, no
-- history, and its status RPC allows ANY transition — including silently
-- reopening finished work with no trace.
--
-- SOLUTION (smallest honest slice):
--   1. work_tasks.object_id — nullable pointer to the new work_objects
--      entity (site truth) from 20260817150000.
--   2. work_task_events — APPEND-ONLY history (the notification_events /
--      audit_logs precedent): one bounded row per real change (created /
--      status_changed / reopened / assigned / unassigned / priority_changed /
--      due_changed / object_changed / dependency_added / dependency_removed),
--      written ONLY by a definer trigger on work_tasks + the dependency RPCs.
--      Readable exactly where the underlying task is readable. No UPDATE or
--      DELETE path exists for anyone below service_role.
--   3. task_dependencies — blocker/blocked edges with RPC-level CYCLE
--      REJECTION (recursive walk, depth-capped) and a same-organization
--      check; readable where the blocked task is readable.
--   4. Six RPCs, the ONLY new write paths:
--        create_work_task_v2   — v1 create + object link + assign-to-other
--                                (managing roles only, target must be an
--                                active org member or an engaged worker —
--                                the assign_worker_to_project precedent);
--        assign_work_task_v1   — assign / unassign an existing task under
--                                the same authority matrix;
--        update_work_task_v2   — v1 field edit + object link;
--        set_work_task_status_v2 — v1 transitions MINUS reopen: a resolved
--                                task (done/cancelled) is terminal here;
--        reopen_work_task_v1   — the ONE reopen path (done → in_progress,
--                                cancelled → todo), managing roles only
--                                (project manager / admin; the creator for
--                                personal tasks), history row guaranteed;
--        add/remove_work_task_dependency_v1 — edge writes with cycle
--                                rejection and history rows.
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   - NO recreate of the three v1 RPCs — they stay exactly as applied
--     (rollback-chain rule). The app layer switches to the v2 names; the v1
--     status RPC remains callable and permissive for compatibility, which is
--     acceptable because everyone it authorizes can already see the task and
--     v1 writes now also produce history rows via the trigger;
--   - NO approval machinery — if task flows later want approval chains they
--     integrate with the generic workflow engine (lib/approvals/, PR #1170)
--     at the action layer; nothing here duplicates it;
--   - NO file attachments — the document engine (PR #1169) owns files; a
--     later slice may reference document ids from task events metadata;
--   - NO scheduler, reminders, or external sending of any kind.
--
-- RLS DECISION, STATED EXPLICITLY: work_task_events and task_dependencies
-- are readable ONLY where the parent work_tasks row is readable (same
-- predicate, evaluated through the work_tasks policy itself in a subquery).
-- Neither table has any INSERT/UPDATE/DELETE policy or grant — the definer
-- trigger and the definer RPCs are the only writers, and history rows are
-- immutable for every client role.
--
-- ROLLBACK: supabase/rollbacks/20260817151000_work_tasks_v2_collaboration.down.sql
-- drops ONLY the six NEW functions, the NEW trigger + trigger function, the
-- two NEW tables (0-row assertions) and the ONE new column. The three v1
-- RPCs were never touched, so nothing is restored verbatim.
-- ============================================================================

begin;

-- ── 1. Object link ──────────────────────────────────────────────────────────
alter table public.work_tasks
  add column if not exists object_id uuid references public.work_objects(id) on delete set null;
create index if not exists wt_object_idx
  on public.work_tasks (object_id)
  where object_id is not null;

-- ── 2. work_task_events — append-only history ──────────────────────────────
create table if not exists public.work_task_events (
  id               uuid primary key default gen_random_uuid(),
  task_id          uuid not null references public.work_tasks(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action           text not null check (action in (
                     'created','status_changed','reopened','assigned',
                     'unassigned','priority_changed','due_changed',
                     'object_changed','dependency_added','dependency_removed'
                   )),
  before_state     jsonb,
  after_state      jsonb,
  created_at       timestamptz not null default now(),
  constraint wte_before_bounded check (before_state is null or pg_column_size(before_state) <= 2048),
  constraint wte_after_bounded  check (after_state  is null or pg_column_size(after_state)  <= 2048)
);
create index if not exists wte_task_created_idx
  on public.work_task_events (task_id, created_at desc);

alter table public.work_task_events enable row level security;

-- Readable exactly where the parent task is readable: the subquery runs
-- under the caller's own work_tasks RLS, so the two visibility rules can
-- never drift apart.
drop policy if exists wte_select on public.work_task_events;
create policy wte_select on public.work_task_events
  for select to authenticated
  using (
    exists (select 1 from public.work_tasks wt where wt.id = task_id)
  );

grant select on public.work_task_events to authenticated;
revoke insert, update, delete on public.work_task_events from authenticated;

-- ── 3. The history trigger — one bounded row per REAL change ───────────────
create or replace function public.log_work_task_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.work_task_events
      (task_id, actor_profile_id, action, before_state, after_state)
    values
      (new.id, v_actor, 'created', null,
       jsonb_build_object(
         'status', new.status,
         'priority', new.priority,
         'assignee_profile_id', new.assignee_profile_id,
         'due_at', new.due_at,
         'object_id', new.object_id));
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.work_task_events
      (task_id, actor_profile_id, action, before_state, after_state)
    values
      (new.id, v_actor,
       case
         when old.status in ('done','cancelled')
          and new.status in ('todo','in_progress','blocked') then 'reopened'
         else 'status_changed'
       end,
       jsonb_build_object('status', old.status),
       jsonb_build_object('status', new.status));
  end if;

  if new.assignee_profile_id is distinct from old.assignee_profile_id then
    insert into public.work_task_events
      (task_id, actor_profile_id, action, before_state, after_state)
    values
      (new.id, v_actor,
       case when new.assignee_profile_id is null then 'unassigned' else 'assigned' end,
       jsonb_build_object('assignee_profile_id', old.assignee_profile_id),
       jsonb_build_object('assignee_profile_id', new.assignee_profile_id));
  end if;

  if new.priority is distinct from old.priority then
    insert into public.work_task_events
      (task_id, actor_profile_id, action, before_state, after_state)
    values
      (new.id, v_actor, 'priority_changed',
       jsonb_build_object('priority', old.priority),
       jsonb_build_object('priority', new.priority));
  end if;

  if new.due_at is distinct from old.due_at then
    insert into public.work_task_events
      (task_id, actor_profile_id, action, before_state, after_state)
    values
      (new.id, v_actor, 'due_changed',
       jsonb_build_object('due_at', old.due_at),
       jsonb_build_object('due_at', new.due_at));
  end if;

  if new.object_id is distinct from old.object_id then
    insert into public.work_task_events
      (task_id, actor_profile_id, action, before_state, after_state)
    values
      (new.id, v_actor, 'object_changed',
       jsonb_build_object('object_id', old.object_id),
       jsonb_build_object('object_id', new.object_id));
  end if;

  return new;
end $$;

revoke all on function public.log_work_task_event() from public;
revoke all on function public.log_work_task_event() from anon;
revoke all on function public.log_work_task_event() from authenticated;

drop trigger if exists trg_work_tasks_history on public.work_tasks;
create trigger trg_work_tasks_history
  after insert or update on public.work_tasks
  for each row execute function public.log_work_task_event();

-- ── 4. task_dependencies — blocker/blocked edges ───────────────────────────
create table if not exists public.task_dependencies (
  id              uuid primary key default gen_random_uuid(),
  blocker_task_id uuid not null references public.work_tasks(id) on delete cascade,
  blocked_task_id uuid not null references public.work_tasks(id) on delete cascade,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  constraint task_dependencies_distinct check (blocker_task_id <> blocked_task_id),
  constraint task_dependencies_unique unique (blocker_task_id, blocked_task_id)
);
create index if not exists td_blocked_idx on public.task_dependencies (blocked_task_id);
create index if not exists td_blocker_idx on public.task_dependencies (blocker_task_id);

alter table public.task_dependencies enable row level security;

-- Readable where the BLOCKED task is readable (the edge is an attribute of
-- the task that is waiting). The blocker id alone leaks nothing beyond an
-- opaque uuid; rendering its title still requires read access to that row.
drop policy if exists td_select on public.task_dependencies;
create policy td_select on public.task_dependencies
  for select to authenticated
  using (
    exists (select 1 from public.work_tasks wt where wt.id = blocked_task_id)
  );

grant select on public.task_dependencies to authenticated;
revoke insert, update, delete on public.task_dependencies from authenticated;

-- ── Shared authority notes ─────────────────────────────────────────────────
-- EDIT authority over a task (assign / reopen / dependencies) follows the
-- assign_worker_to_project precedent:
--   * admin, or
--   * project task  → can_manage_project(project_id)   (managing roles), or
--   * personal task → its creator.
-- Assignment TARGET eligibility (project tasks): an ACTIVE member of the
-- project's organization (company_memberships) OR a worker the caller
-- manages (caller_manages_worker — roster or active engagement). A personal
-- task can only ever be self-assigned, exactly like v1.
-- Anti-oracle rule everywhere: no readable relationship → 'not_found'.

-- ── 5. create_work_task_v2 — create + object + assign-to-other ─────────────
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
  v_worker   uuid;
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
    select w.id into v_worker
      from public.workers w where w.profile_id = v_assignee;
    if not (
      (v_proj_org is not null and exists (
        select 1 from public.company_memberships m
         where m.organization_id = v_proj_org
           and m.profile_id = v_assignee
           and m.status = 'active'))
      or (v_worker is not null and public.caller_manages_worker(v_worker))
    ) then
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

-- ── 6. assign_work_task_v1 — assign / unassign an existing task ────────────
create or replace function public.assign_work_task_v1(
  p_task_id             text,
  p_assignee_profile_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_task     uuid := nullif(trim(coalesce(p_task_id, '')), '')::uuid;
  v_assignee uuid := nullif(trim(coalesce(p_assignee_profile_id, '')), '')::uuid;
  t          record;
  v_proj_org uuid;
  v_worker   uuid;
  v_can_edit boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_task is null then
    return 'invalid';
  end if;

  select wt.id, wt.project_id, wt.created_by, wt.assignee_profile_id
    into t
    from public.work_tasks wt
   where wt.id = v_task
   for update;
  if not found then
    return 'not_found';
  end if;

  v_can_edit := public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
    or (t.project_id is null and t.created_by = uid);
  if not v_can_edit then
    -- Visible-but-unauthorized (creator/assignee of a project task) hears
    -- the honest refusal; everyone else gets the no-leak answer.
    if t.created_by = uid or t.assignee_profile_id = uid then
      return 'not_allowed';
    end if;
    return 'not_found';
  end if;

  if v_assignee is not null then
    if t.project_id is null then
      -- A personal task can only ever be self-assigned (the v1 rule).
      if v_assignee <> uid then
        return 'invalid_assignee';
      end if;
    else
      select pr.organization_id into v_proj_org
        from public.projects pr where pr.id = t.project_id;
      select w.id into v_worker
        from public.workers w where w.profile_id = v_assignee;
      if not (
        (v_proj_org is not null and exists (
          select 1 from public.company_memberships m
           where m.organization_id = v_proj_org
             and m.profile_id = v_assignee
             and m.status = 'active'))
        or (v_worker is not null and public.caller_manages_worker(v_worker))
      ) then
        return 'invalid_assignee';
      end if;
    end if;
  end if;

  update public.work_tasks wt
     set assignee_profile_id = v_assignee,
         updated_at          = now()
   where wt.id = v_task;

  return 'updated';
exception
  when invalid_text_representation then
    return 'invalid';
end $$;

revoke all on function public.assign_work_task_v1(text, text) from public;
revoke all on function public.assign_work_task_v1(text, text) from anon;
grant execute on function public.assign_work_task_v1(text, text) to authenticated;

-- ── 7. update_work_task_v2 — v1 field edit + object link ───────────────────
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

-- ── 8. set_work_task_status_v2 — forward transitions only ──────────────────
-- Identical authority to v1; the ONE behavioural change is that a resolved
-- task (done/cancelled) is TERMINAL here — reopening is its own gated act
-- (reopen_work_task_v1) so finished work can never be silently un-finished.
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
  if not (
    t.created_by = uid
    or t.assignee_profile_id = uid
    or public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
  ) then
    return 'not_found';
  end if;

  -- Terminal states do not move through this path.
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

-- ── 9. reopen_work_task_v1 — the ONE reopen path ───────────────────────────
create or replace function public.reopen_work_task_v1(
  p_task_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_task uuid := nullif(trim(coalesce(p_task_id, '')), '')::uuid;
  t      record;
  v_can  boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_task is null then
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

  -- Reopening finished work is a MANAGING act: admin, the project's manager,
  -- or — for personal tasks — the creator. The assignee alone cannot reopen.
  v_can := public.is_admin()
    or (t.project_id is not null and public.can_manage_project(t.project_id))
    or (t.project_id is null and t.created_by = uid);
  if not v_can then
    if t.created_by = uid or t.assignee_profile_id = uid then
      return 'not_allowed';
    end if;
    return 'not_found';
  end if;

  if t.status not in ('done','cancelled') then
    return 'invalid_transition';
  end if;

  -- done → in_progress (work resumes); cancelled → todo (work restarts).
  update public.work_tasks wt
     set status      = case when t.status = 'done' then 'in_progress' else 'todo' end,
         resolved_at = null,
         updated_at  = now()
   where wt.id = v_task;

  return 'updated';
exception
  when invalid_text_representation then
    return 'invalid';
end $$;

revoke all on function public.reopen_work_task_v1(text) from public;
revoke all on function public.reopen_work_task_v1(text) from anon;
grant execute on function public.reopen_work_task_v1(text) to authenticated;

-- ── 10. add_work_task_dependency_v1 — edge insert with cycle rejection ─────
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

  -- The BLOCKED task is the one being edited — full edit authority needed.
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

  -- The BLOCKER must be VISIBLE to the caller (v1 read predicate) — one
  -- answer for missing and unreadable rows.
  select wt.id, wt.project_id, wt.created_by, wt.assignee_profile_id
    into b
    from public.work_tasks wt
   where wt.id = v_blocker;
  if not found or not (
    b.created_by = uid
    or b.assignee_profile_id = uid
    or public.is_admin()
    or (b.project_id is not null and public.can_manage_project(b.project_id))
  ) then
    return 'not_found';
  end if;

  -- Same-organization check: when BOTH tasks are project tasks their
  -- projects must belong to the same organization.
  if t.project_id is not null and b.project_id is not null then
    select pr.organization_id into v_blocked_org
      from public.projects pr where pr.id = t.project_id;
    select pr.organization_id into v_blocker_org
      from public.projects pr where pr.id = b.project_id;
    if v_blocked_org is distinct from v_blocker_org then
      return 'invalid';
    end if;
  end if;

  -- Bounded graph: a task waits on a short list, not a dependency dump.
  if (select count(*) from public.task_dependencies td
       where td.blocked_task_id = v_blocked) >= 50 then
    return 'limit_reached';
  end if;

  -- CYCLE REJECTION: refuse when the blocker transitively depends on the
  -- blocked task. Depth-capped walk; hitting the cap refuses conservatively
  -- (a graph that deep is a modelling error, not a plan).
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

-- ── 11. remove_work_task_dependency_v1 ─────────────────────────────────────
create or replace function public.remove_work_task_dependency_v1(
  p_blocker_task_id text,
  p_blocked_task_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_blocker uuid := nullif(trim(coalesce(p_blocker_task_id, '')), '')::uuid;
  v_blocked uuid := nullif(trim(coalesce(p_blocked_task_id, '')), '')::uuid;
  t         record;
  v_deleted int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_blocker is null or v_blocked is null then
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

  delete from public.task_dependencies td
   where td.blocker_task_id = v_blocker
     and td.blocked_task_id = v_blocked;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return 'not_found';
  end if;

  insert into public.work_task_events
    (task_id, actor_profile_id, action, before_state, after_state)
  values
    (v_blocked, uid, 'dependency_removed',
     jsonb_build_object('blocker_task_id', v_blocker), null);

  return 'updated';
exception
  when invalid_text_representation then
    return 'invalid';
end $$;

revoke all on function public.remove_work_task_dependency_v1(text, text) from public;
revoke all on function public.remove_work_task_dependency_v1(text, text) from anon;
grant execute on function public.remove_work_task_dependency_v1(text, text) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260817151000_work_tasks_v2_collaboration.down.sql
-- drops the six NEW functions, the trigger + trigger function, the two NEW
-- tables (0-row assertions) and the ONE new column. The three v1 RPCs were
-- never touched.
