-- 20260807090000 — org owner membership seed v1 (M-P0-4 gap closure)
--
-- SAFETY CLASS: RED. SECURITY DEFINER trigger function + CREATE TRIGGER +
-- explicit revokes + a guarded one-time backfill INSERT. Ships WITHOUT a
-- human-gate marker (CODE_COMPLETE_PENDING_OWNER_GATE): CI migration-safety
-- is expected RED until a separate owner apply decision is recorded. DO NOT
-- APPLY TO PRODUCTION before that decision.
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
--       on public.organizations — every new org with a non-null
--       owner_profile_id gets ONE active owner membership
--       (role 'owner', status 'active', accepted_at now(), source
--       'org-create'). Idempotent: skipped when a LIVE (invited|active)
--       tuple already exists; ON CONFLICT DO NOTHING backstops races on
--       the company_memberships_live_key partial unique index.
--   (b) a one-time backfill inserting the missing owner membership for
--       every existing org whose owner has NO live membership row —
--       mirroring the original backfill rule exactly
--       (organizations.owner_profile_id → role 'owner', status 'active'),
--       with source 'backfill:organizations.owner_profile_id:v2' so these
--       rows stay distinguishable from the 20260806090000 wave while still
--       matching the 'backfill:%' provenance class.
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
  if new.owner_profile_id is not null then
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
  end if;
  return new;
end $$;

revoke all on function public.company_memberships_seed_org_owner() from public;
revoke all on function public.company_memberships_seed_org_owner() from anon;

drop trigger if exists on_org_owner_membership_seed on public.organizations;
create trigger on_org_owner_membership_seed
  after insert on public.organizations
  for each row execute function public.company_memberships_seed_org_owner();

-- ── 3. One-time backfill for already-orphaned orgs ────────────────────────
-- Mirrors 20260806090000's rule verbatim: organizations.owner_profile_id →
-- owner/active. Guarded: only orgs whose owner has NO live membership row
-- gain one; revoked history never blocks a re-seed of live governance.
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
on conflict do nothing;

-- ── 4. Post-conditions ────────────────────────────────────────────────────
-- After this migration NO org with an owner_profile_id may lack a live
-- membership row for that owner — the exact defect the finding names.
do $$
declare
  orphaned int;
begin
  select count(*) into orphaned
    from public.organizations o
   where o.owner_profile_id is not null
     and not exists (
       select 1 from public.company_memberships m
        where m.organization_id = o.id
          and m.profile_id = o.owner_profile_id
          and m.status in ('invited','active')
     );
  if orphaned > 0 then
    raise exception
      'seed incomplete: % organization(s) still have an owner without a live membership row',
      orphaned;
  end if;
end $$;
