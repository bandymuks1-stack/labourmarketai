-- ============================================================================
-- ROLLBACK for 20260808150000_caller_manages_worker_engagements_v1.sql
--
-- Restores the pre-change authorization exactly:
--   * `caller_manages_worker` → the 20260609120000 roster-only body, verbatim.
--   * `assign_worker_to_project` → the APPLIED 20260804120000 body, verbatim
--     (i.e. WITHOUT the engagement OR-branch, which is what production runs
--     today).
--   * drops `caller_manages_worker_by_roster`, which this slice introduced.
--
-- SAFE: no data is touched. No table, column, index, constraint, trigger,
-- policy or grant is created or dropped; this is a pure authorization revert
-- of three function bodies. There is no DML.
--
-- ORDER MATTERS: `assign_worker_to_project` is restored BEFORE the roster
-- helper is dropped, because the shipped version of that function calls it.
-- Dropping first would fail (dependency) or leave the assign RPC raising
-- `42883` at runtime for every caller.
--
-- WHAT RUNNING THIS COSTS — both defects come back, knowingly:
--   * A1: an employer holding an active accepted-booking engagement is blind
--     to that worker's absence requests again (/dashboard/absences shows an
--     empty "Requests to review"), and cannot approve one if handed the id.
--   * The booking→engagement project-assign bridge is orphaned again:
--     `caller_has_booking_engagement_for_project` returns to ZERO callers, so
--     an engaged-but-unrostered worker cannot be assigned to any project.
-- No application code needs reverting alongside it — the absence surface is a
-- plain RLS-governed read and degrades to "no rows", not to an error.
-- ============================================================================

begin;

-- 1. assign_worker_to_project — back to the APPLIED 20260804120000 body -----
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
  v_status text;
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

  -- BOTH gates: caller manages THIS project AND the worker is on the caller's
  -- active roster (or admin). Neither alone is sufficient.
  if not (
    (public.can_manage_project(pid) and public.caller_manages_worker(w_id))
    or public.is_admin()
  ) then
    raise exception 'Not authorized to assign this worker to this project'
      using errcode = '42501';
  end if;

  -- W11: a completed project is terminal. Checked AFTER authorization so the
  -- refusal cannot be used to probe the status of a project the caller may not
  -- manage. `22023` is the same invalid-argument class the guards above use, so
  -- the app layer maps it through its existing error path.
  select status into v_status from public.projects where id = pid;
  if v_status = 'completed' then
    raise exception 'Project is completed' using errcode = '22023';
  end if;

  insert into public.project_worker_assignments (project_id, worker_id, status, assigned_at, ended_at)
    values (pid, w_id, 'active', now(), null)
  on conflict (project_id, worker_id) do update
    set status = 'active', ended_at = null
  returning id into row_id;

  return row_id;
end;
$$;

-- 2. caller_manages_worker — back to the 20260609120000 roster-only body ----
create or replace function public.caller_manages_worker(p_worker_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.company_workers cw
     where cw.worker_id = p_worker_id and cw.status = 'active'
       and public.owns_company(cw.company_id)
  ) or exists (
    select 1 from public.agency_workers aw
     where aw.worker_id = p_worker_id and aw.status = 'active'
       and public.owns_agency(aw.agency_id)
  );
$$;
revoke all on function public.caller_manages_worker(uuid) from public;
grant execute on function public.caller_manages_worker(uuid) to authenticated;

-- 3. Drop the helper this slice introduced (now unreferenced) ---------------
drop function if exists public.caller_manages_worker_by_roster(uuid);

commit;
