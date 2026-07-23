-- Rollback for 20260723120000_company_worker_engagements_v1.
-- Drops the four new functions + the engagement table and RESTORES the
-- ORIGINAL 20260609120000 assign_worker_to_project body verbatim (roster-only
-- gate). Run inside one transaction via Supabase MCP after owner approval.

begin;

drop function if exists public.end_company_worker_engagement_v1(uuid);
drop function if exists public.list_booking_engagement_workers_v1();
drop function if exists public.respond_booking_request_v3(uuid, text, text, text);

-- Restore the ORIGINAL assign gate (20260609120000) BEFORE dropping the
-- helper it no longer references.
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

drop function if exists public.caller_has_booking_engagement_for_project(uuid, uuid);

drop policy if exists company_worker_engagements_select on public.company_worker_engagements;
drop index if exists public.company_worker_engagements_active_pair_idx;
drop index if exists public.company_worker_engagements_worker_idx;
drop index if exists public.company_worker_engagements_company_idx;
drop table if exists public.company_worker_engagements;

commit;
