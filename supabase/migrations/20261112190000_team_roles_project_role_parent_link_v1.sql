-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT, not an approval. NO OWNER APPROVAL OF THIS SQL
-- EXISTS YET. Draft PR + needs-human-gate. NOT applied. Apply only via Supabase MCP apply_migration.
-- ============================================================================
-- 20261112190000_team_roles_project_role_parent_link_v1
--
-- SAFETY CLASS: RED (structure for new authority; proposal for an owner decision).
-- Rollback: supabase/rollbacks/20261112190000_team_roles_project_role_parent_link_v1.down.sql
--
-- STRUCTURE ONLY. Three nullable columns, two checks, two indexes. No policy,
-- no function, no grant, no data change: after this migration alone nothing
-- reads or writes the new columns and no person sees or may do anything new.
-- The functions that would use them are specified in the PR description and
-- are a SEPARATE step, written only after the owner decides the open points.
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
