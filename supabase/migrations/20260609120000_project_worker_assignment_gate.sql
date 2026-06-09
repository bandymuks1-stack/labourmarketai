-- ─────────────────────────────────────────────────────────────────────────
-- F4 — Worker→Project assignment gate (slice f4-worker-project-assignment-v1)
--
-- WHY: an instruction should later be scoped to a worker on a SPECIFIC project
-- (F5). The project layer is applied (projects, project_worker_assignments,
-- can_manage_project), but `project_worker_assignments` write is gated only by
-- `can_manage_project(project_id)` — a manager could place ANY worker_id on
-- their own project, including a worker NOT on their roster. That is the
-- "broad manager-to-any-worker" we must not allow.
--
-- WHAT THIS ADDS (additive + reversible; tightening only; no RLS policy change):
--   1. assign_worker_to_project(...)  — SECURITY DEFINER, owner-scoped, gated on
--      can_manage_project(p) AND the worker being on the CALLER's ACTIVE roster
--      (active company_workers/agency_workers under owns_company/owns_agency), or
--      admin. Upserts the assignment to status='active' (re-activates an ended one).
--   2. end_worker_project_assignment(...) — SECURITY DEFINER, can_manage_project
--      (or admin); sets status='ended', ended_at=now(). NO delete (audit trail).
--   3. REVOKE insert/update/delete on project_worker_assignments FROM authenticated
--      (keep SELECT) — so the ONLY write path is the gated RPCs above. This closes
--      the roster-bypass gap. No app code writes the table directly (verified).
--   4. grant execute on both RPCs to authenticated; revoke from public.
--
-- The pwa SELECT policy (owns_worker OR can_manage_project) is UNCHANGED — a
-- worker still sees only their own assignments; a manager only their projects'.
-- No RLS loosening, no broad grants, no destructive op.
--
-- ROLLBACK (reversible):
--   grant insert, update, delete on public.project_worker_assignments to authenticated;
--   drop function if exists public.end_worker_project_assignment(text, text);
--   drop function if exists public.assign_worker_to_project(text, text);
-- ─────────────────────────────────────────────────────────────────────────

-- Is the worker (by worker_id) on the CALLER's active company/agency roster?
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

  -- BOTH gates: caller manages THIS project AND the worker is on the caller's
  -- active roster (or admin). Neither alone is sufficient.
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

create or replace function public.end_worker_project_assignment(
  p_project_id        text,
  p_worker_profile_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  pid   uuid := nullif(p_project_id, '')::uuid;
  w_pid uuid := nullif(p_worker_profile_id, '')::uuid;
  w_id  uuid;
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

  if not (public.can_manage_project(pid) or public.is_admin()) then
    raise exception 'Not authorized to manage this project' using errcode = '42501';
  end if;

  -- End, never delete (audit trail).
  update public.project_worker_assignments
     set status = 'ended', ended_at = now()
   where project_id = pid and worker_id = w_id and status = 'active';
end;
$$;
revoke all on function public.end_worker_project_assignment(text, text) from public;
grant execute on function public.end_worker_project_assignment(text, text) to authenticated;

-- Route ALL writes through the gated RPCs above (close the roster-bypass gap).
-- SELECT stays so managers/workers can still read via the unchanged pwa RLS.
revoke insert, update, delete on public.project_worker_assignments from authenticated;
