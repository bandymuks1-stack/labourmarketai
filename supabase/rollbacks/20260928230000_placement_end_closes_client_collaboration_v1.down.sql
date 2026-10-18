-- Rollback 20260928230000: end_worker_project_assignment exactly as production
-- had it (read back 2026-09-28). Relationships already closed stay closed.
create or replace function public.end_worker_project_assignment(p_project_id text, p_worker_profile_id text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  update public.project_worker_assignments
     set status = 'ended', ended_at = now()
   where project_id = pid and worker_id = w_id and status = 'active';
end;
$function$;

revoke all on function public.end_worker_project_assignment(text, text) from public, anon;
grant execute on function public.end_worker_project_assignment(text, text) to authenticated;
