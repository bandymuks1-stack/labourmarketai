-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260714210000 — company memberships v1 (Company Architecture Completion,
-- Sprint v2 §5: multi-company switching).
--
-- REUSE INVESTIGATION (why this migration does NOT create a new
-- `company_memberships` table): the repo ALREADY has a canonical
-- multi-membership model —
--   • `public.organizations` (0013): one row per org, `owner_profile_id`
--     already allows ONE person to own MANY organizations;
--   • `public.engagement_contexts` (0013): the profile↔organization
--     membership spine (`relationship_slug` from the §10 registry
--     `public.relationship_types` — 'owner' / 'manager' /
--     'external_manager'), kept complete by the 0035 owner-engagement
--     trigger + backfill and by add_org_member / grant_org_manager
--     (20260530140000);
--   • `public.manages_organization()` (0013) already answers "is this
--     profile a manager-level member of this org?".
-- Creating `company_memberships (profile_id, organization_id, role_slug)`
-- would be a SECOND truth for the same fact — forbidden by the one-canonical-
-- model doctrine. What the existing model is MISSING for multi-company
-- switching is only:
--   (1) a server-side "which organization is this profile currently acting
--       as" pointer (today the header always resolves the single legacy
--       `companies.profile_id` row — no way to switch), and
--   (2) a read-only membership slug for future non-managing members
--       ('viewer') in the existing §10 registry.
--
-- WHAT THIS MIGRATION DOES (additive only, zero changes to existing rows'
-- semantics):
--   (a) seeds the 'viewer' slug into the EXISTING `relationship_types`
--       registry (idempotent) — prepared for read-only memberships; no code
--       path grants it any capability yet (honest absence);
--   (b) adds `profiles.active_organization_id` (nullable FK → organizations,
--       ON DELETE SET NULL) — the server-side active-company pointer
--       (NEVER localStorage);
--   (c) membership-validation triggers: the pointer can only be set to an
--       organization the profile actually belongs to (org owner, or an
--       ACTIVE engagement_context with slug owner/manager/external_manager/
--       viewer). Default-closed: any other value is rejected (42501);
--   (d) idempotent in-migration backfill: every profile that owns at least
--       one organization and has no pointer yet gets its OLDEST owned
--       organization as the default active one (matches today's de-facto
--       behaviour — the single legacy company row is the oldest org).
--
-- RLS / GRANTS: unchanged. `profiles` UPDATE stays owner-only
-- (profiles_update, 0001) with the table-level grant from 0004; the new
-- column rides on the same owner-only policy. `organizations` SELECT stays
-- owner-scoped. No new table, no new RPC, no anon access.
--
-- COMPATIBILITY: until applied, the app feature-detects 42703 (undefined
-- column) and falls back to today's single-company behaviour (header shows
-- the legacy companies row; no switcher is rendered). Nothing is faked.
-- ROLLBACK: paired supabase/rollbacks/20260714210000_company_memberships_v1.down.sql.
--
-- POST-APPLY VERIFICATION:
--   select slug from relationship_types where slug = 'viewer';   -- 1 row
--   As an owner of org X:  update profiles set active_organization_id = '<X>'
--     where id = auth.uid();                                     -- ok
--   As the same user with a foreign org id:                      -- 42501
--   select count(*) from profiles where active_organization_id is not null;
--     -- = number of profiles owning >= 1 organization
--   + APPLIED_LEDGER.md row.
--
-- @human-gate-approved — TIER: owner-gated (profiles DDL + SECURITY DEFINER
-- trigger function = RED-class; annotation downgrades the CI finding only —
-- the OWNER still applies manually).
-- ============================================================================

begin;

-- ── (a) 'viewer' membership slug in the EXISTING §10 registry ──────────────
insert into public.relationship_types (slug, category, is_active)
values ('viewer', 'other', true)
on conflict (slug) do nothing;

-- ── (b) server-side active-company pointer ──────────────────────────────────
alter table public.profiles
  add column if not exists active_organization_id uuid
    references public.organizations(id) on delete set null;

create index if not exists idx_profiles_active_organization
  on public.profiles(active_organization_id)
  where active_organization_id is not null;

-- ── (c) default-closed membership validation ───────────────────────────────
-- SECURITY DEFINER (like 0035's ensure_org_owner_engagement) so the
-- membership lookup is not blocked by the owner-scoped organizations RLS
-- when a manager-level (non-owner) member switches.
create or replace function public.validate_active_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active_organization_id is not null then
    if not exists (
      select 1 from public.organizations o
       where o.id = new.active_organization_id
         and o.owner_profile_id = new.id
    ) and not exists (
      select 1 from public.engagement_contexts ec
       where ec.profile_id = new.id
         and ec.organization_id = new.active_organization_id
         and ec.status = 'active'
         and ec.relationship_slug in
             ('owner', 'manager', 'external_manager', 'viewer')
    ) then
      raise exception 'active_organization_not_member'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

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

-- DOWN (paired rollback file — supabase/rollbacks/
-- 20260714210000_company_memberships_v1.down.sql):
--   drop trigger if exists profiles_active_org_validate_update on public.profiles;
--   drop trigger if exists profiles_active_org_validate_insert on public.profiles;
--   drop function if exists public.validate_active_organization();
--   drop index if exists idx_profiles_active_organization;
--   alter table public.profiles drop column if exists active_organization_id;
--   delete from public.relationship_types rt
--     where rt.slug = 'viewer'
--       and not exists (select 1 from public.engagement_contexts ec
--                        where ec.relationship_slug = 'viewer');
