-- ROLLBACK for 20261003150600_brigade_work_assignment_v1.sql
--
-- REFUSES while ANY team_assignments row exists: those rows are real
-- assignment history (who was put on what, when, and when it ended). After
-- real use the correct move is a FORWARD FIX.
--
-- With zero rows it removes exactly what the migration added and nothing
-- else: the five functions, the policy, the indexes and the table. No existing
-- function, policy, grant, column or constraint was touched by the forward
-- migration, so there is nothing to restore.

begin;

do $$
declare
  n bigint;
begin
  if to_regclass('public.team_assignments') is not null then
    execute 'select count(*) from public.team_assignments' into n;
    if n > 0 then
      raise exception
        'team_assignment rollback refused: % row(s) of assignment history exist - forward-fix instead', n;
    end if;
  end if;
end $$;

drop function if exists public.team_assignments_for_work_v1(uuid, uuid, timestamptz);
drop function if exists public.list_team_assignment_members_v1(uuid[], timestamptz);
drop function if exists public.end_team_assignment_v1(uuid, text);
drop function if exists public.assign_team_to_work_v1(uuid, uuid, uuid, uuid, uuid);
drop function if exists public.team_member_at_v1(uuid, uuid, timestamptz);

drop policy if exists team_assignments_select_v1 on public.team_assignments;
drop index if exists public.team_assignments_one_active_v1;
drop index if exists public.team_assignments_project_idx;
drop index if exists public.team_assignments_team_idx;
drop table if exists public.team_assignments;

commit;
