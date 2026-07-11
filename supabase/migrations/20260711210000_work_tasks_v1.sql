-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260711210000 — work_tasks v1: the general work/task-management layer
-- (control-room capability programme PR D2; gap map §3; repo-safe consumer
-- layer already merged in PR D1 / #707 and degrading honestly until this is
-- applied).
--
-- PROBLEM: the platform has an admin-only follow-up queue
-- (follow_up_tasks) and a project-worker readiness checklist, but NO
-- assignable, due-dated task primitive connected to real projects and
-- people. The merged /dashboard/tasks surface, the open-task-attention
-- spine signal and the activity centre all read the contract below and
-- currently show the truthful "preparing" state.
--
-- SOLUTION (smallest honest slice): ONE new table + THREE new gated write
-- RPCs. The consumer code on main already matches this contract exactly
-- (apps/web/lib/tasks/* — guard-pinned in lib/guards/work-tasks.test.ts):
--
--   1. work_tasks — a bounded task row: title 3..160, description <= 2000,
--      HONEST lifecycle enum todo / in_progress / blocked / done /
--      cancelled (no fake states, no urgency scores beyond a 3-value
--      priority the creator sets), optional project pointer, optional
--      source pointer (ids only — never copied names/emails), optional
--      assignee, due_at, resolved_at stamped only on done/cancelled.
--   2. RLS SELECT: creator, assignee, is_admin(), or the project's manager
--      via the EXISTING can_manage_project() helper when project_id is
--      set. No anon path, no cross-user leak: a task with no relation to
--      the caller is invisible.
--   3. create_work_task_v1 / set_work_task_status_v1 / update_work_task_v1
--      are the ONLY write paths (direct insert/update/delete REVOKEd, no
--      write policies). SECURITY DEFINER, all re-check authorization
--      server-side, validate enums and bounds, verify the project exists
--      and is manageable by the caller, and cap open tasks per creator.
--
-- NO EXTERNAL SENDING — BY CONSTRUCTION: internal task rows only. No
-- email, SMS, push, Telegram, webhook or outbound call of any kind exists
-- in this migration or the consuming app code (guard-pinned in
-- work-tasks.test.ts).
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   - NO comments/attachments columns — comments reuse the conversation
--     spine and attachments the document/evidence axes in later gated
--     slices (execution report, PR D notes);
--   - NO assignee free-pick over unauthorized rows — v1 writes allow only
--     self-assign or unassigned (p_assign_to_self), matching the UI;
--   - NO scheduler, reminders or due-date automation;
--   - NO recreate of ANY existing RPC/trigger/table — the table and all
--     three functions are NEW names (rollback-chain rule: nothing to
--     restore verbatim);
--   - NO change to any existing table, policy, grant, or constraint.
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- GRANTs + new RLS-bearing table are RED-class). Ships as a
-- needs-human-gate DRAFT with the exact SQL; prod apply stays manual via
-- Supabase MCP after owner approval — never db push. Until applied, the
-- app degrades honestly: reads see 42P01 and /dashboard/tasks shows the
-- "preparing" state; the spine count stays 0 (nothing faked).
--
-- ROLLBACK: supabase/rollbacks/20260711210000_work_tasks_v1.down.sql
-- restores the prior state exactly: drops ONLY the three NEW functions and
-- the one NEW table (feature-created rows live ONLY in that table). No
-- existing RPC was recreated, so the down file contains no create-function.
-- ============================================================================

begin;

-- ── 1. work_tasks — the assignable, due-dated task row ──────────────────────
create table if not exists public.work_tasks (
  id                  uuid primary key default gen_random_uuid(),
  -- Optional project pointer; managers of that project can see/manage the
  -- task via the EXISTING can_manage_project() helper.
  project_id          uuid references public.projects(id) on delete cascade,
  -- Optional source pointer (ids only, both-or-neither): where the task
  -- came from. Display resolution stays app-side (conversation source
  -- pattern) — no FK because the four sources live in different tables.
  source_type         text check (source_type in ('project','booking','demand','company')),
  source_id           uuid,
  title               text not null check (
                        char_length(trim(title)) >= 3
                        and char_length(title) <= 160
                      ),
  description         text check (char_length(description) <= 2000),
  -- HONEST lifecycle only — matches the app enum exactly.
  status              text not null default 'todo'
                        check (status in ('todo','in_progress','blocked','done','cancelled')),
  priority            text not null default 'normal'
                        check (priority in ('low','normal','high')),
  assignee_profile_id uuid references public.profiles(id) on delete set null,
  created_by          uuid not null references public.profiles(id) on delete cascade,
  due_at              timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  constraint wt_source_shape check (
    (source_type is null and source_id is null)
    or
    (source_type is not null and source_id is not null)
  ),
  constraint wt_resolved_shape check (
    (status in ('done','cancelled') and resolved_at is not null)
    or
    (status in ('todo','in_progress','blocked') and resolved_at is null)
  )
);
create index if not exists wt_assignee_status_idx
  on public.work_tasks (assignee_profile_id, status);
create index if not exists wt_creator_status_idx
  on public.work_tasks (created_by, status);
create index if not exists wt_project_idx
  on public.work_tasks (project_id)
  where project_id is not null;

alter table public.work_tasks enable row level security;

-- SELECT: creator, assignee, admin, or manager of the linked project. No
-- other read path — unrelated callers cannot even learn the row exists.
drop policy if exists wt_select on public.work_tasks;
create policy wt_select on public.work_tasks
  for select to authenticated
  using (
    created_by = auth.uid()
    or assignee_profile_id = auth.uid()
    or public.is_admin()
    or (project_id is not null and public.can_manage_project(project_id))
  );
-- No insert/update/delete policy: the three gated RPCs below are the ONLY
-- write paths (direct writes are REVOKEd further down).

-- ── 2. create_work_task_v1 — the ONLY insert path ───────────────────────────
create or replace function public.create_work_task_v1(
  p_title          text,
  p_description    text,
  p_priority       text,
  p_due_date       text,
  p_project_id     text,
  p_assign_to_self boolean
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_title   text := nullif(trim(coalesce(p_title, '')), '');
  v_desc    text := nullif(trim(coalesce(p_description, '')), '');
  v_prio    text := nullif(trim(coalesce(p_priority, '')), '');
  v_due     date;
  v_project uuid := nullif(trim(coalesce(p_project_id, '')), '')::uuid;
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

  -- A project task may only be created by someone who manages that project
  -- (re-checked inside the definer — the client value is never trusted).
  if v_project is not null and not public.can_manage_project(v_project) then
    return 'not_allowed';
  end if;

  -- Abuse cap: a personal work queue is a short list, not a data dump.
  if (select count(*) from public.work_tasks wt
       where wt.created_by = uid
         and wt.status in ('todo','in_progress','blocked')) >= 200 then
    return 'task_limit_reached';
  end if;

  insert into public.work_tasks
    (project_id, title, description, status, priority,
     assignee_profile_id, created_by, due_at)
  values
    (v_project, v_title, v_desc, 'todo', v_prio,
     case when coalesce(p_assign_to_self, false) then uid else null end,
     uid,
     case when v_due is null then null else v_due::timestamptz end);

  return 'created';
exception
  when invalid_text_representation or datetime_field_overflow then
    return 'invalid';
end $$;

revoke all on function public.create_work_task_v1(text, text, text, text, text, boolean) from public;
grant execute on function public.create_work_task_v1(text, text, text, text, text, boolean) to authenticated;

-- ── 3. set_work_task_status_v1 — the ONLY status-transition path ────────────
create or replace function public.set_work_task_status_v1(
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
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_task is null
     or v_status is null
     or v_status not in ('todo','in_progress','blocked','done','cancelled') then
    return 'invalid';
  end if;

  -- ONE row; ONLY status + resolved_at + updated_at ever change. The same
  -- people who can see the task can move it (creator / assignee / admin /
  -- project manager) — re-checked here, never trusted from the client.
  update public.work_tasks wt
     set status      = v_status,
         resolved_at = case when v_status in ('done','cancelled') then now() else null end,
         updated_at  = now()
   where wt.id = v_task
     and (
       wt.created_by = uid
       or wt.assignee_profile_id = uid
       or public.is_admin()
       or (wt.project_id is not null and public.can_manage_project(wt.project_id))
     );

  if not found then
    -- Row missing OR caller unauthorized — one answer, no existence leak.
    return 'not_found';
  end if;

  return 'updated';
exception
  when invalid_text_representation then
    return 'invalid';
end $$;

revoke all on function public.set_work_task_status_v1(text, text) from public;
grant execute on function public.set_work_task_status_v1(text, text) to authenticated;

-- ── 4. update_work_task_v1 — the ONLY field-edit path ───────────────────────
create or replace function public.update_work_task_v1(
  p_task_id     text,
  p_title       text,
  p_description text,
  p_priority    text,
  p_due_date    text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_task  uuid := nullif(trim(coalesce(p_task_id, '')), '')::uuid;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_desc  text := nullif(trim(coalesce(p_description, '')), '');
  v_prio  text := nullif(trim(coalesce(p_priority, '')), '');
  v_due   date;
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

  -- Bounded fields + updated_at only; same authorization set as the
  -- status RPC, re-checked server-side.
  update public.work_tasks wt
     set title       = v_title,
         description = v_desc,
         priority    = v_prio,
         due_at      = case when v_due is null then null else v_due::timestamptz end,
         updated_at  = now()
   where wt.id = v_task
     and (
       wt.created_by = uid
       or wt.assignee_profile_id = uid
       or public.is_admin()
       or (wt.project_id is not null and public.can_manage_project(wt.project_id))
     );

  if not found then
    return 'not_found';
  end if;

  return 'updated';
exception
  when invalid_text_representation or datetime_field_overflow then
    return 'invalid';
end $$;

revoke all on function public.update_work_task_v1(text, text, text, text, text) from public;
grant execute on function public.update_work_task_v1(text, text, text, text, text) to authenticated;

-- ── 5. Grants — SELECT only to authenticated; writes are RPC-only ───────────
grant select on public.work_tasks to authenticated;
revoke insert, update, delete on public.work_tasks from authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260711210000_work_tasks_v1.down.sql
-- restores the prior state exactly (drops the three NEW functions and the
-- one NEW table; feature-created rows live only in that table).
