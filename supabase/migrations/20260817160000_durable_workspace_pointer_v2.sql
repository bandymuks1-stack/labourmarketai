-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration by the LEAD session.
-- Never `db push`. Status: PENDING APPLY BY LEAD.
--
-- 20260817160000 — durable workspace pointer v2 (duplication consolidation
-- train L, slice 1; supersedes the never-applied draft
-- 20260714210000_company_memberships_v1.sql).
--
-- @human-gate-approved — pre-approved by owner mandate 2026-08-17
-- (autonomous functional completion train V2, §4 migration authority).
-- TIER: RED-class findings knowingly carried: profiles DDL + SECURITY
-- DEFINER trigger function + grant/revoke hygiene + one idempotent backfill
-- UPDATE. Safety class: ADDITIVE column + validation trigger, fully
-- backward-compatible — the app feature-detects the column's absence TODAY
-- (42703 / PGRST204 in lib/company/active-organization.ts and
-- lib/company/organization-actions.ts), so applying it only upgrades the
-- session-cookie pointer to a durable cross-device one. No existing row's
-- semantics change; the backfill only fills NULLs.
--
-- PROBLEM
-- The active-workspace choice lives only in an httpOnly session cookie
-- (`lm_active_workspace`). It works, but it is per-browser: a person who
-- switches workspace on their phone starts over on their laptop. The durable
-- pointer column `profiles.active_organization_id` was drafted in
-- 20260714210000 but never applied — and that draft is now WRONG to apply:
-- its validation trigger predates company_memberships (M-P0-4, applied
-- 2026-08-06) and accepts only organizations.owner_profile_id +
-- engagement_contexts rows. Production today holds ONE active
-- company_memberships manager with NO engagement_contexts counterpart
-- (measured 2026-08-17); the old trigger would 42501-reject that person's
-- switch, and the switch action then deletes their session pointer too
-- (organization-actions.ts NOT_MEMBER_CODE arm) — switching would BREAK for
-- exactly the people the membership commands admitted.
--
-- SOLUTION (smallest honest slice)
--   (a) seed the 'viewer' slug into the EXISTING relationship_types registry
--       (idempotent; prepared for read-only memberships; no code path grants
--       it any capability yet — honest absence);
--   (b) add `profiles.active_organization_id` (nullable FK → organizations,
--       ON DELETE SET NULL) + partial index — the durable pointer;
--   (c) default-closed validation trigger accepting BOTH membership truths:
--         * org owner (organizations.owner_profile_id), OR
--         * ACTIVE engagement_contexts row with slug owner / manager /
--           external_manager / employee / viewer, OR
--         * ACTIVE company_memberships row (any role).
--       Anything else raises 42501 ('active_organization_not_member').
--       WHY 'employee' IS IN THE EC SLUG SET (the one deliberate widening
--       vs the lead spec's owner/manager/external_manager/viewer): the app's
--       workspace switcher LISTS active org-bound employee engagements
--       (lib/company/active-organization.ts readEngagementMemberships — no
--       slug filter) and the switch action's own comment pins the contract
--       "a row it offers can always be switched to"
--       (lib/company/organization-actions.ts). Production holds 40 employee
--       EC rows; most employees have NO company_memberships row until train
--       L5's CM backfill lands. Excluding 'employee' would make the DB veto
--       (42501 → cookie rollback) break workspace switching for every
--       employee the moment this is applied. The pointer grants NO
--       authority — employer surfaces still gate on ACTIVE
--       company_memberships via employer-company-context.ts.
--   (d) idempotent backfill: profiles owning >= 1 organization and holding
--       no pointer get their OLDEST owned organization (today's de-facto
--       single-company default), so existing owners see no behaviour change.
--
-- WHAT IS DELIBERATELY NOT ADDED
--   * NO new table, NO new RPC, NO RLS/policy change. `profiles` UPDATE
--     stays owner-only (0001 policy + 0004 grant); the new column rides the
--     same owner-only policy.
--   * NO company_memberships backfill for employees (train L5 step 2, a
--     separate owner-reviewed data step).
--   * NO change to the cookie mechanism: the session pointer stays the
--     most-recent in-session choice; this column is the cross-device
--     default it falls back to (D-20 resolver semantics unchanged).
--
-- RLS DECISION, STATED EXPLICITLY
-- The trigger function is SECURITY DEFINER (like 0035's
-- ensure_org_owner_engagement) so the membership lookup is not blocked by
-- owner-scoped organizations RLS when a non-owner member switches. It is
-- pinned to search_path = public and EXECUTE is revoked from public, anon
-- AND authenticated — it is reachable only through the triggers. No table
-- grant changes.
--
-- SUPERSESSION
-- 20260714210000_company_memberships_v1.sql remains in the tree (guard
-- company-architecture-v1.test.ts pins its content) but is superseded by
-- THIS file — its header carries a SUPERSEDED-BY-20260817160000 note and it
-- must never be applied. The APPLIED_LEDGER Deferred entries record both.
--
-- POST-APPLY VERIFICATION (lead)
--   select slug from relationship_types where slug = 'viewer';       -- 1 row
--   select count(*) from profiles where active_organization_id is not null;
--     -- = number of profiles owning >= 1 organization
--   As an org owner: update own pointer to the owned org               -- ok
--   As a CM-only active member (the prod manager row): same             -- ok
--   As an org-bound ACTIVE employee (EC only): same                     -- ok
--   With a foreign org id: 42501; with a revoked/ended membership: 42501
--   Proof matrix: scripts/db-proof/durable-workspace-pointer-v2.sh
--
-- ROLLBACK: supabase/rollbacks/20260817160000_durable_workspace_pointer_v2.down.sql
-- ============================================================================

begin;

-- ── (a) 'viewer' membership slug in the EXISTING §10 registry ──────────────
insert into public.relationship_types (slug, category, is_active)
values ('viewer', 'other', true)
on conflict (slug) do nothing;

-- ── (b) durable server-side workspace pointer ───────────────────────────────
alter table public.profiles
  add column if not exists active_organization_id uuid
    references public.organizations(id) on delete set null;

create index if not exists idx_profiles_active_organization
  on public.profiles(active_organization_id)
  where active_organization_id is not null;

-- ── (c) default-closed validation across BOTH membership truths ────────────
create or replace function public.validate_active_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active_organization_id is not null then
    if not exists (
      -- Truth 0: the org's owner column (0013).
      select 1 from public.organizations o
       where o.id = new.active_organization_id
         and o.owner_profile_id = new.id
    ) and not exists (
      -- Truth 1 (EMPLOYMENT): an ACTIVE engagement in this org. 'employee'
      -- is deliberately included — see the header: the workspace switcher
      -- lists employee engagements and "a row it offers can always be
      -- switched to". The pointer grants no authority.
      select 1 from public.engagement_contexts ec
       where ec.profile_id = new.id
         and ec.organization_id = new.active_organization_id
         and ec.status = 'active'
         and ec.relationship_slug in
             ('owner', 'manager', 'external_manager', 'employee', 'viewer')
    ) and not exists (
      -- Truth 2 (GOVERNANCE): an ACTIVE company_memberships row, any role —
      -- the arm the superseded 20260714210000 draft was missing.
      select 1 from public.company_memberships cm
       where cm.profile_id = new.id
         and cm.organization_id = new.active_organization_id
         and cm.status = 'active'
    ) then
      raise exception 'active_organization_not_member'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Trigger-only helper: nobody calls it directly.
revoke all on function public.validate_active_organization() from public;
revoke execute on function public.validate_active_organization() from anon;
revoke execute on function public.validate_active_organization() from authenticated;

-- Fire only when the pointer is actually being set / changed — profile
-- updates that do not touch the column pay zero cost.
drop trigger if exists profiles_active_org_validate_update on public.profiles;
create trigger profiles_active_org_validate_update
  before update of active_organization_id on public.profiles
  for each row
  when (new.active_organization_id is not null
        and new.active_organization_id is distinct from old.active_organization_id)
  execute function public.validate_active_organization();

drop trigger if exists profiles_active_org_validate_insert on public.profiles;
create trigger profiles_active_org_validate_insert
  before insert on public.profiles
  for each row
  when (new.active_organization_id is not null)
  execute function public.validate_active_organization();

-- ── (d) idempotent backfill: oldest owned org becomes the default ──────────
update public.profiles p
   set active_organization_id = (
     select o.id
       from public.organizations o
      where o.owner_profile_id = p.id
      order by o.created_at asc
      limit 1
   )
 where p.active_organization_id is null
   and exists (
     select 1 from public.organizations o
      where o.owner_profile_id = p.id
   );

commit;

-- ROLLBACK (paired file supabase/rollbacks/
-- 20260817160000_durable_workspace_pointer_v2.down.sql):
--   drop trigger if exists profiles_active_org_validate_update on public.profiles;
--   drop trigger if exists profiles_active_org_validate_insert on public.profiles;
--   drop function if exists public.validate_active_organization();
--   drop index if exists idx_profiles_active_organization;
--   alter table public.profiles drop column if exists active_organization_id;
--   delete from public.relationship_types rt
--     where rt.slug = 'viewer'
--       and not exists (select 1 from public.engagement_contexts ec
--                        where ec.relationship_slug = 'viewer');
