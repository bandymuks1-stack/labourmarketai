-- @human-gate-approved
--
-- ── SCOPE OF THE OWNER APPROVAL (Finding-2 apply decision, 2026-08-06) ────
--
-- The owner reviewed the human-gate package on PR #1043 at reviewed HEAD
-- 61b444bd (migration sha256 f4e79346…0605c; comment-stripped executable
-- sha256 e4aebfb6…51668 — unchanged by this annotation, which is comments
-- only) and approved applying THIS migration to production via Supabase MCP
-- apply_migration. The approval covers exactly: atomic owner membership
-- seeding for every new organization; fail-closed refusal of ownerless
-- organization creation; the guarded orphan backfill (expected: exactly the
-- three QA-SYNTHETIC organizations); and the reviewed
-- trigger/function/grant model. Findings acknowledged and downgraded to
-- notices for THIS file: security-definer-function, grant-or-revoke,
-- create-trigger, data-dml. Nothing beyond that list is approved.
--
-- 20260807090000 — org owner membership seed v1 (M-P0-4 gap closure)
--
-- SAFETY CLASS: RED. SECURITY DEFINER trigger function + CREATE TRIGGER +
-- explicit revokes + a guarded one-time backfill INSERT.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- PRODUCTION FINDING (2026-08-06 PROD_QA multi-org journey): organizations
-- created AFTER the M-P0-4 backfill (20260806090000_company_memberships_v1)
-- get NO company_memberships row for their owner. The backfill ran once; no
-- write path seeds new orgs. The membership commands (20260806120000,
-- membership_actor_role_v1) derive authority ONLY from active membership
-- rows BY DESIGN — so a fresh org's owner cannot invite anyone and the
-- governance member directory on /dashboard/start never renders. The whole
-- governance spine is unreachable for every org created after the backfill.
-- save_company_setup_v3 (20260805190000) explicitly deferred this handoff
-- ("when M-P0-4 lands") and it was never completed. Three current orphan
-- orgs (the QA-SYNTHETIC Alfa/Beta/Gama rows) demonstrate it.
--
-- This is the company_memberships analogue of 0035 (which closed the SAME
-- run-once-backfill gap for owner engagement_contexts after 0013): an
-- AFTER INSERT trigger so every future org is born with its owner
-- membership, plus a guarded one-time backfill for the orgs already
-- orphaned.
--
-- ── WHAT ───────────────────────────────────────────────────────────────────
--   (a) public.company_memberships_seed_org_owner() + AFTER INSERT trigger
--       on public.organizations — every new org gets ONE active owner
--       membership (role 'owner', status 'active', accepted_at now(),
--       source 'org-create'). FAIL-CLOSED: an INSERT with a NULL
--       owner_profile_id is REFUSED (org_without_owner) — an organization
--       whose canonical owner membership cannot be created must not be
--       created at all (fresh-organization-owner-membership-v1 §4). Every
--       reviewed writer (the company mirror, the agency mirror, the
--       team-creation RPC of 20260705220000, the 0013 backfills) always
--       stamps the creator, so no legitimate path is affected. Idempotent: skipped when a LIVE
--       (invited|active) tuple already exists; ON CONFLICT DO NOTHING
--       backstops races on the company_memberships_live_key partial
--       unique index.
--   (b) a one-time backfill inserting the missing owner membership for
--       every existing org whose owner has NO live membership row —
--       mirroring the original backfill rule
--       (organizations.owner_profile_id → role 'owner', status 'active'),
--       with source 'backfill:organizations.owner_profile_id:v2' so these
--       rows stay distinguishable from the 20260806090000 wave while still
--       matching the 'backfill:%' provenance class. AMBIGUITY GUARD (§5):
--       an org where a DIFFERENT profile already holds an active owner
--       membership is classified ambiguous and NEVER written — the
--       backfill must not mint a second owner where governance truth and
--       organizations.owner_profile_id disagree. Such rows are reported
--       via NOTICE and excluded from the post-condition (production count
--       on 2026-08-06: zero).
--
-- Doctrine invariants preserved (owner directive §14):
--   * governance ≠ employment — NO engagement_contexts row is created,
--     read for authority, or touched; NO write outside company_memberships;
--   * one LIVE tuple per profile/organization (live-key respected);
--   * the seed inserts only the org's OWN owner — never a third party;
--   * 'employee' never appears; no role beyond 'owner' is granted.
--
-- Known narrow scope (deliberate): INSERT only. An UPDATE of
-- organizations.owner_profile_id (ownership transfer) does NOT reseed —
-- transfer semantics belong to the reviewed membership commands, and the
-- last-owner survival trigger governs that path.
--
-- ROLLBACK: supabase/rollbacks/20260807090000_org_owner_membership_seed_v1.down.sql
-- drops the trigger + function. Seeded ROWS stay: they are derived truth
-- (organizations.owner_profile_id remains intact), deleting an org's only
-- active owner membership is blocked by protect_last_owner BY DESIGN, and
-- deleting them would re-open the production defect this migration closes.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Safety assertions ──────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.company_memberships') is null then
    raise exception
      'company_memberships missing — apply 20260806090000 BEFORE this migration';
  end if;
  if to_regclass('public.organizations') is null then
    raise exception 'organizations missing — this schema predates the org spine';
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'company_memberships_live_key'
  ) then
    raise exception
      'company_memberships_live_key missing — the one-live-tuple invariant this seed relies on is absent';
  end if;
end $$;

-- ── 2. Seed function + trigger ────────────────────────────────────────────
-- SECURITY DEFINER for the same reason the 0013 mirror and 0035 seed are:
-- authenticated has NO write grant on company_memberships (writes are
-- RPC-only by design) and org rows can be created from definer contexts;
-- the seed must succeed regardless of the inserting role. search_path
-- pinned; revoked below from public/anon (20260806090000 §6 pattern —
-- Postgres already refuses direct calls to trigger-returning functions,
-- the revokes close the grant layer too).
create or replace function public.company_memberships_seed_org_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- §4 fail-closed: creation must not succeed when the canonical owner
  -- membership cannot be created. Every reviewed writer stamps the creator;
  -- a NULL here is a defect, not a state to tolerate silently.
  if new.owner_profile_id is null then
    raise exception
      'org_without_owner: organization % has no owner_profile_id — the canonical owner membership cannot be created, so the organization must not be created',
      new.id
      using errcode = '23514';
  end if;
  insert into public.company_memberships
    (organization_id, profile_id, role, status, accepted_at, source)
  select new.id, new.owner_profile_id, 'owner', 'active', now(), 'org-create'
  where not exists (
    select 1 from public.company_memberships m
     where m.organization_id = new.id
       and m.profile_id = new.owner_profile_id
       and m.status in ('invited','active')
  )
  on conflict do nothing;
  return new;
end $$;

revoke all on function public.company_memberships_seed_org_owner() from public;
revoke all on function public.company_memberships_seed_org_owner() from anon;
-- default privileges grant EXECUTE to authenticated at creation; nothing but
-- the trigger machinery may hold this function (§7: grants are EXACT — the
-- grant would be inert either way, Postgres refuses direct calls to
-- trigger-returning functions, but inert is not exact).
revoke all on function public.company_memberships_seed_org_owner() from authenticated;

drop trigger if exists on_org_owner_membership_seed on public.organizations;
create trigger on_org_owner_membership_seed
  after insert on public.organizations
  for each row execute function public.company_memberships_seed_org_owner();

-- ── 3. One-time backfill for already-orphaned orgs ────────────────────────
-- Mirrors 20260806090000's rule: organizations.owner_profile_id →
-- owner/active. Guarded twice:
--   * only orgs whose canonical owner has NO live membership row gain one
--     (revoked history never blocks a re-seed of live governance);
--   * AMBIGUITY GUARD (§5): an org where a DIFFERENT profile already holds
--     an active owner membership is never written — do not mint a second
--     owner where governance truth and owner_profile_id disagree.
insert into public.company_memberships
  (organization_id, profile_id, role, status, accepted_at, source)
select o.id, o.owner_profile_id, 'owner', 'active', now(),
       'backfill:organizations.owner_profile_id:v2'
  from public.organizations o
 where o.owner_profile_id is not null
   and not exists (
     select 1 from public.company_memberships m
      where m.organization_id = o.id
        and m.profile_id = o.owner_profile_id
        and m.status in ('invited','active')
   )
   and not exists (
     select 1 from public.company_memberships m2
      where m2.organization_id = o.id
        and m2.role = 'owner' and m2.status = 'active'
        and m2.profile_id <> o.owner_profile_id
   )
on conflict do nothing;

-- ── 4. Post-conditions ────────────────────────────────────────────────────
-- After this migration NO unambiguous org with an owner_profile_id may lack
-- a live membership row for that owner — the exact defect the finding
-- names. Ambiguous orgs (a different active owner already present) are the
-- §5 do-not-write class: reported, never blocking, never written.
do $$
declare
  orphaned  int;
  ambiguous int;
begin
  select count(*) into ambiguous
    from public.organizations o
   where o.owner_profile_id is not null
     and not exists (
       select 1 from public.company_memberships m
        where m.organization_id = o.id
          and m.profile_id = o.owner_profile_id
          and m.status in ('invited','active')
     )
     and exists (
       select 1 from public.company_memberships m2
        where m2.organization_id = o.id
          and m2.role = 'owner' and m2.status = 'active'
          and m2.profile_id <> o.owner_profile_id
     );
  if ambiguous > 0 then
    raise notice
      'owner-membership seed: % organization(s) left untouched as AMBIGUOUS (a different active owner already holds governance) — resolve by hand',
      ambiguous;
  end if;

  select count(*) into orphaned
    from public.organizations o
   where o.owner_profile_id is not null
     and not exists (
       select 1 from public.company_memberships m
        where m.organization_id = o.id
          and m.profile_id = o.owner_profile_id
          and m.status in ('invited','active')
     )
     and not exists (
       select 1 from public.company_memberships m2
        where m2.organization_id = o.id
          and m2.role = 'owner' and m2.status = 'active'
          and m2.profile_id <> o.owner_profile_id
     );
  if orphaned > 0 then
    raise exception
      'seed incomplete: % organization(s) still have an owner without a live membership row',
      orphaned;
  end if;
end $$;
