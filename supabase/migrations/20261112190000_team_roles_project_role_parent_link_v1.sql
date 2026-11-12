-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT, not an approval. NO OWNER APPROVAL OF THIS SQL
-- EXISTS YET. Draft PR + needs-human-gate. NOT applied. Apply only via Supabase MCP apply_migration.
-- ============================================================================
-- 20261112190000_team_roles_project_role_parent_link_v1
--
-- SAFETY CLASS: RED (structure for new authority; proposal for an owner decision).
-- Rollback: supabase/rollbacks/20261112190000_team_roles_project_role_parent_link_v1.down.sql
--
-- Three nullable columns, three checks, two indexes, and ONE function:
-- set_team_member_role_v1, the team-lead LABEL (coordinator instruction
-- 2026-11-12: label only, no authority, until the owner decides otherwise).
-- No policy is added, altered or dropped and no data changes. No existing
-- helper, policy or function reads team_role, so a lead may do nothing a
-- member may not. parent_organization_id and project_role get NO writer here:
-- their functions wait for the owner's decisions (PR description).
--
-- What each column is for (a "team" is generic: a shift, a care team, a crew):
--
--   organizations.parent_organization_id
--     The company a team belongs to. Today a team is linked to a company only
--     through the PERSON who created it (owner_profile_id), so a company cannot
--     list "all of its teams" and a second manager sees none of them. Null for
--     every existing row; a team created before this stays exactly as it is.
--
--   engagement_contexts.team_role
--     A member's role INSIDE a team: 'lead' or 'member'. Null = not set (every
--     existing row). At most one active lead per team (partial unique index).
--     It is a label on the membership; by itself it grants no authority.
--
--   project_worker_assignments.project_role
--     What a person does ON one project, in the manager's words (1..80
--     characters), e.g. "sous-chef", "night shift lead". Null = not set. Shown
--     beside the person; not an access role (positions are not RBAC roles,
--     PLATFORM_DOCTRINE §5).
--
-- Additive and widening only: every existing row and every existing query
-- stays valid. Existing RLS is untouched (the new columns are covered by the
-- tables' existing row policies; no policy is added, altered or dropped).
--
-- @plan-cache-proof: n/a — organizations_parent_idx serves a future "teams of this company" read that is not written yet and no existing RPC filters by it; engagement_contexts_one_team_lead_uq is uniqueness only
-- ============================================================================

alter table public.organizations
  add column if not exists parent_organization_id uuid
    references public.organizations(id) on delete set null;

-- Only a team may have a parent, and never itself.
alter table public.organizations
  add constraint organizations_parent_only_for_team_chk
  check (
    parent_organization_id is null
    or (organization_type = 'team' and parent_organization_id <> id)
  );

create index if not exists organizations_parent_idx
  on public.organizations (parent_organization_id)
  where parent_organization_id is not null;

alter table public.engagement_contexts
  add column if not exists team_role text;

alter table public.engagement_contexts
  add constraint engagement_contexts_team_role_chk
  check (team_role is null or team_role in ('lead', 'member'));

-- One active lead per team at most.
create unique index if not exists engagement_contexts_one_team_lead_uq
  on public.engagement_contexts (organization_id)
  where team_role = 'lead' and status = 'active';

alter table public.project_worker_assignments
  add column if not exists project_role text;

alter table public.project_worker_assignments
  add constraint project_worker_assignments_project_role_chk
  check (project_role is null or char_length(btrim(project_role)) between 1 and 80);

-- ── The team-lead LABEL ─────────────────────────────────────────────────────
-- Who: the team's owner (organizations.owner_profile_id) or an admin. The same
-- person who may already disband the team and end its memberships.
-- What: sets team_role on ONE active membership of a team to 'lead', 'member'
-- or null (not set). Naming a new lead moves the previous lead to 'member' in
-- the same call, so a team never has two. Nothing else is written; the
-- membership's status, relationship and hash columns are untouched.
-- Returns: 'set' | 'unchanged' | 'invalid_role' | 'not_found' | 'not_a_team' |
-- 'not_allowed'. Every change writes one audit_logs row.
create or replace function public.set_team_member_role_v1(
  p_engagement_id uuid,
  p_role          text
) returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid        uuid := auth.uid();
  v_role     text := nullif(btrim(coalesce(p_role, '')), '');
  v_team     uuid;
  v_profile  uuid;
  v_current  text;
  v_type     text;
  v_owner    uuid;
  v_archived timestamptz;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_role is not null and v_role not in ('lead', 'member') then
    return 'invalid_role';
  end if;
  if p_engagement_id is null then
    return 'not_found';
  end if;

  select ec.organization_id, ec.profile_id, ec.team_role
    into v_team, v_profile, v_current
    from public.engagement_contexts ec
   where ec.id = p_engagement_id
     and ec.status = 'active'
     and ec.relationship_slug = 'employee';
  if not found or v_team is null then
    return 'not_found';
  end if;

  select o.organization_type, o.owner_profile_id, o.archived_at
    into v_type, v_owner, v_archived
    from public.organizations o
   where o.id = v_team;
  if v_type is distinct from 'team' or v_archived is not null then
    return 'not_a_team';
  end if;
  if v_owner is distinct from uid and not public.is_admin() then
    return 'not_allowed';
  end if;

  if v_current is not distinct from v_role then
    return 'unchanged';
  end if;

  if v_role = 'lead' then
    update public.engagement_contexts
       set team_role = 'member', updated_at = now()
     where organization_id = v_team
       and status = 'active'
       and team_role = 'lead'
       and id <> p_engagement_id;
  end if;

  update public.engagement_contexts
     set team_role = v_role, updated_at = now()
   where id = p_engagement_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'set_team_member_role_v1', 'engagement_contexts', p_engagement_id,
    jsonb_build_object('team_id', v_team, 'profile_id', v_profile,
                       'from', v_current, 'to', v_role));

  return 'set';
end $function$;

-- A SECURITY DEFINER function never inherits a default EXECUTE grant: state it.
revoke all on function public.set_team_member_role_v1(uuid, text) from public;
revoke all on function public.set_team_member_role_v1(uuid, text) from anon;
grant execute on function public.set_team_member_role_v1(uuid, text) to authenticated;
