-- @human-gate-approved — owner approved PR #2604 (2026-10-21): the buyer's project manager reads brigade hours through edits (supersede walk) and the hired brigade's name; names only, project managers only.
-- Conditions: within this defect's purpose, organization isolation kept, no unauthorized data change; verified in a rolled-back production test. Scope: this SQL only.
-- 20261021092000_team_assignment_names_v1
--
-- RED by SECURITY DEFINER + GRANT (a new read door). The
-- `-- @human-gate-approved` line is added ONLY after the owner approves this
-- exact SQL (then also list this file in booking-engagement-end-v1.test.ts).
--
-- THE DEFECT. The project page names each team on the project by reading
-- `organizations` directly (lib/projects/team-assignment.ts). organizations_select
-- (20260802170000) admits the owner, an active member and an admin only. The
-- buyer's project manager is none of these for a brigade it hired, so the row
-- is invisible, the name is NULL and every hired brigade reads as the generic
-- "Komanda" — while the same manager already sees the assignment
-- (team_assignments_select_v1: can_manage_project) and every member of it
-- (list_team_assignment_members_v1: can_manage_project).
--
-- THE FIX. list_team_assignment_names_v1(p_assignment_ids uuid[]) returns
-- (assignment_id, team_name) for the given team assignments whose PROJECT the
-- caller may manage — the existing predicate public.can_manage_project
-- (20260601091000: owns_company(project.company_id) or
-- manages_organization(project.organization_id) or is_admin()), the same one
-- the assignment's own RLS and the member resolver use. Name only:
-- coalesce(display_name, legal_name), the directory's rule
-- (search_organizations_directory_v1). Team organizations only. At most 200 ids
-- (the page's READ_LIMIT); unknown, foreign or unmanaged ids yield no row.
-- Read-only; no table, no RLS policy and no row is changed.
--
-- Callers that could already read the organization (its owner, members,
-- admins) keep doing so through RLS; the app asks this door first and reads
-- `organizations` only for teams it did not name.
--
-- Rollback: supabase/rollbacks/20261021092000_team_assignment_names_v1.down.sql
-- (the function is new: the rollback drops it).

begin;

create or replace function public.list_team_assignment_names_v1(p_assignment_ids uuid[])
returns table(assignment_id uuid, team_name text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  return query
  select ta.id, coalesce(o.display_name, o.legal_name)
    from public.team_assignments ta
    join public.organizations o
      on o.id = ta.team_org_id
     and o.organization_type = 'team'
   where ta.id = any ((coalesce(p_assignment_ids, '{}'::uuid[]))[1:200])
     -- Only a manager of the assignment's project; anyone else gets no row.
     and coalesce(public.can_manage_project(ta.project_id), false)
   order by ta.id;
end
$function$;

revoke all on function public.list_team_assignment_names_v1(uuid[]) from public, anon;
grant execute on function public.list_team_assignment_names_v1(uuid[]) to authenticated;

commit;
