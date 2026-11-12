-- ============================================================================
-- ROLLBACK for 20261112190000_team_roles_project_role_parent_link_v1.sql
--
-- REFUSES while any of the three columns holds a value: a team's company, a
-- member's role in a team, or a person's role on a project is something a
-- person set, and it lives nowhere else. To roll back deliberately, those
-- values must be dealt with first, by the owner, as a separate decision.
-- With all three columns empty this restores the schema exactly.
-- ONE transaction: when the guard refuses, nothing below it runs, whatever
-- client applies this file (proved on a scratch PostgreSQL 16).
-- Apply via Supabase MCP apply_migration, never `db push`.
-- ============================================================================

begin;

do $$
declare
  n_parent bigint;
  n_team   bigint;
  n_proj   bigint;
begin
  select count(*) into n_parent from public.organizations where parent_organization_id is not null;
  select count(*) into n_team from public.engagement_contexts where team_role is not null;
  select count(*) into n_proj from public.project_worker_assignments where project_role is not null;
  if n_parent > 0 or n_team > 0 or n_proj > 0 then
    raise exception
      'ROLLBACK REFUSED: % team(s) have a company link, % membership(s) have a team role, % assignment(s) have a project role; dropping these columns would delete them.',
      n_parent, n_team, n_proj;
  end if;
end $$;

drop function if exists public.set_team_member_role_v1(uuid, text);

drop index if exists public.engagement_contexts_one_team_lead_uq;
drop index if exists public.organizations_parent_idx;

alter table public.project_worker_assignments
  drop constraint if exists project_worker_assignments_project_role_chk;
alter table public.engagement_contexts
  drop constraint if exists engagement_contexts_team_role_chk;
alter table public.organizations
  drop constraint if exists organizations_parent_only_for_team_chk;

alter table public.project_worker_assignments drop column if exists project_role;
alter table public.engagement_contexts drop column if exists team_role;
alter table public.organizations drop column if exists parent_organization_id;

commit;
