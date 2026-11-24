-- ============================================================================
-- DOWN — 20260705220000_team_brigade_org_spine (owner-run manual rollback).
--
-- Restores the pre-wagon state EXACTLY:
--   1. removes ONLY feature-created rows: every organizations row with
--      organization_type='team' (only create_team_v1 can mint them — direct
--      writes are admin-only under 0013 RLS) and the engagement_contexts rows
--      scoped to those team orgs (the 0035-trigger 'owner' engagement + any
--      add_org_member 'employee' memberships on team orgs);
--   2. restores the ORIGINAL 0013 organizations_organization_type_check
--      constraint VERBATIM: ('company','agency','other');
--   3. drops ONLY the two NEW functions this wagon introduced.
--
-- ROLLBACK-CHAIN RULE: 20260705220000 recreated NO existing RPC and NO
-- existing trigger (create_team_v1 and get_team_capability_summary_v1 are
-- new names). Therefore this down file must NOT and does NOT contain any
-- `create function` / `create or replace function` — there is no prior body
-- to restore. add_org_member (20260530140000), manages_organization (0013),
-- ensure_org_owner_engagement (0035) and every other existing RPC remain the
-- repo-latest definitions, untouched in both directions.
--
-- audit_logs rows written by create_team_v1 are append-only audit history and
-- are deliberately kept (0001 doctrine).
-- ============================================================================

begin;

-- 1. Remove feature-created engagement rows, then the team org rows.
delete from public.engagement_contexts ec
 where ec.organization_id in (
   select o.id from public.organizations o
    where o.organization_type = 'team'
 );

delete from public.organizations o
 where o.organization_type = 'team';

-- 2. Restore the ORIGINAL 0013 constraint verbatim.
alter table public.organizations
  drop constraint if exists organizations_organization_type_check;
alter table public.organizations
  add constraint organizations_organization_type_check
  check (organization_type in ('company','agency','other'));

-- 3. Drop ONLY the two new functions.
drop function if exists public.create_team_v1(text);
drop function if exists public.get_team_capability_summary_v1(uuid);

commit;
