-- Rollback for 20260915130000_project_team_assignments_v1.sql
--
-- READ BEFORE APPLYING. An ACTIVE unit row means a brigade is on a project
-- right now; dropping the table forgets that the per-person assignments
-- were one act, and nothing could then end them as one. The drop refuses
-- while active unit rows exist — end them deliberately first (which also
-- ends the member assignments the unit gave). Ended rows are history and
-- are dropped with the table.
--
-- ONE TRANSACTION, load-bearing.
begin;

do $$
declare n integer;
begin
  if to_regclass('public.project_team_assignments') is not null then
    select count(*) into n from public.project_team_assignments where status = 'active';
    if n > 0 then
      raise exception
        'project_team_assignments still holds % active brigade assignment(s) — end them deliberately before rolling back', n;
    end if;
  end if;
end $$;

drop function if exists public.end_team_project_assignment_v1(uuid);
drop function if exists public.assign_team_to_project_v1(uuid, uuid);
drop policy if exists project_team_assignment_members_select on public.project_team_assignment_members;
drop policy if exists project_team_assignments_select on public.project_team_assignments;
drop table if exists public.project_team_assignment_members;
drop index if exists public.project_team_assignments_active_uq;
drop index if exists public.project_team_assignments_team_idx;
drop table if exists public.project_team_assignments;

commit;
