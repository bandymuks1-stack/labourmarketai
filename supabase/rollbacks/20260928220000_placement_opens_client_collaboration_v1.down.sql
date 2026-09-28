-- Rollback 20260928220000: assign_worker_to_project exactly as production had it
-- (read back 2026-09-28), and 'collaborator' not journal-reviewable again.
-- Collaborator contexts already opened stay (they record a real placement).
update public.relationship_types set journal_reviewable = false where slug = 'collaborator';

create or replace function public.assign_worker_to_project(p_project_id text, p_worker_profile_id text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  -- BOTH gates: the caller manages THIS project AND the worker is on the
  -- caller's active ROSTER, or holds an active accepted-booking engagement
  -- with the company that canonically owns THIS EXACT project (or admin).
  -- Neither gate alone is sufficient. `by_roster` (not the widened
  -- `caller_manages_worker`) keeps engagement authority bound to the
  -- engaging company's own projects — a sibling company of the same owner
  -- must still be refused.
  if not (
    (public.can_manage_project(pid)
      and (public.caller_manages_worker_by_roster(w_id)
           or public.caller_has_booking_engagement_for_project(w_id, pid)))
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
$function$;

revoke all on function public.assign_worker_to_project(text, text) from public, anon;
grant execute on function public.assign_worker_to_project(text, text) to authenticated;
