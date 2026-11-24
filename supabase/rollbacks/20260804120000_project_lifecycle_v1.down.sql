-- ============================================================================
-- ROLLBACK — W11 project lifecycle v1 (20260804120000)
--
-- ─── THE LIMITATION, STATED FIRST BECAUSE IT IS THE POINT ───────────────────
-- This rollback is safe ONLY BEFORE THE FIRST REAL COMPLETION. Once real rows
-- exist it becomes destructive or dishonest, and it must refuse rather than
-- proceed:
--
--   * a project in 'completed' cannot survive the old CHECK
--     ('draft','live','paused','closed'). Reverting the constraint would force
--     a choice between failing the migration and silently rewriting a finished
--     project back to 'live' or 'draft' — i.e. reopening work the business
--     closed, in the database, with no audit of the reopening.
--   * an assignment ended BY a completion carries a real `ended_at`. Clearing
--     it would falsify history: those people really did stop working on that
--     project on that date. Leaving it while dropping the RPC is fine — the
--     row stays true — so this rollback never touches assignments.
--
-- THEREFORE: the guards below abort the rollback the moment either kind of row
-- exists. After the first completion the correct move is a FORWARD FIX or a
-- separate owner data decision, never this file.
--
-- Reverting to 'closed' is deliberately NOT attempted even when the table is
-- empty of completed rows: the old value was dead on arrival (nothing ever
-- wrote it, and lib/reports/reports-hub.ts never modelled it), so restoring it
-- restores nothing. The constraint simply returns to its pre-W11 shape.
--
-- What this file removes:
--   1. set_project_status_v1        — the whole lifecycle write
--   2. the completed-project guard inside assign_worker_to_project
--      (restored byte-for-byte to 20260609120000:55-99)
--   3. the status CHECK, back to ('draft','live','paused','closed')
-- ============================================================================

begin;

-- ── GUARD 1: no project may already be completed ────────────────────────────
do $$
declare
  n int;
begin
  select count(*) into n from public.projects where status = 'completed';
  if n > 0 then
    raise exception
      'ROLLBACK REFUSED: % project(s) are completed. Reverting the CHECK would '
      'either fail or silently reopen finished work. Use a forward fix or an '
      'explicit owner data decision.', n
      using errcode = 'P0001';
  end if;
end $$;

-- ── GUARD 2: no assignment may have been ended by a lifecycle completion ────
-- Keyed on the audit trail rather than on `ended_at`, because
-- `end_worker_project_assignment` has been ending assignments one at a time
-- since 2026-06-09. Only rows this slice ended may block its own rollback.
do $$
declare
  n int;
begin
  select count(*) into n
    from public.audit_logs
   where action = 'end_project_assignment'
     and payload ->> 'cause' = 'project_completed';
  if n > 0 then
    raise exception
      'ROLLBACK REFUSED: % assignment ending(s) were created by project '
      'completion. Clearing them would falsify history; leaving them while '
      'removing the path that explains them is worse. Use a forward fix.', n
      using errcode = 'P0001';
  end if;
end $$;

-- ── 1. the lifecycle write ──────────────────────────────────────────────────
drop function if exists public.set_project_status_v1(uuid, text);

-- ── 2. assign_worker_to_project WITHOUT the completed guard ─────────────────
-- Byte-for-byte the body from 20260609120000:55-99.
create or replace function public.assign_worker_to_project(
  p_project_id        text,
  p_worker_profile_id text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  pid     uuid := nullif(p_project_id, '')::uuid;
  w_pid   uuid := nullif(p_worker_profile_id, '')::uuid;
  w_id    uuid;
  row_id  uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if pid is null or w_pid is null then
    raise exception 'Project and worker are required' using errcode = '22023';
  end if;

  select id into w_id from public.workers where profile_id = w_pid;
  if w_id is null then
    raise exception 'No such worker' using errcode = 'P0002';
  end if;

  if not (
    (public.can_manage_project(pid) and public.caller_manages_worker(w_id))
    or public.is_admin()
  ) then
    raise exception 'Not authorized to assign this worker to this project'
      using errcode = '42501';
  end if;

  insert into public.project_worker_assignments (project_id, worker_id, status, assigned_at, ended_at)
    values (pid, w_id, 'active', now(), null)
  on conflict (project_id, worker_id) do update
    set status = 'active', ended_at = null
  returning id into row_id;

  return row_id;
end;
$$;
revoke all on function public.assign_worker_to_project(text, text) from public;
grant execute on function public.assign_worker_to_project(text, text) to authenticated;

-- ── 3. the constraint, back to its pre-W11 shape ────────────────────────────
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects
  add constraint projects_status_check
  check (status in ('draft', 'live', 'paused', 'closed'));

commit;
