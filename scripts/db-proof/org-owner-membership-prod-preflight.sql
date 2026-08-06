-- ============================================================================
-- FRESH-ORG OWNER MEMBERSHIP — PRODUCTION PREFLIGHT (READ-ONLY).
--
-- Run BEFORE applying 20260807090000_org_owner_membership_seed_v1 to
-- production, and AGAIN immediately before the apply if time has passed:
-- the classification below is a snapshot, and any org created in between
-- changes the expected backfill count.
--
-- Every statement is a SELECT. Nothing here writes.
--
-- Usage (Supabase MCP execute_sql, or psql against the prod pooler with a
-- read-only role):
--   psql "$PROD_URL" -v ON_ERROR_STOP=1 -f scripts/db-proof/org-owner-membership-prod-preflight.sql
--
-- Recorded snapshot 2026-08-06 (main dbad6b75):
--   total=13, canonical=10, backfill_eligible=3 (the QA-SYNTHETIC
--   Alfa/Beta/Gama orgs), ambiguous=0, no_owner_evidence=0.
-- ============================================================================

-- ── 1. Classification totals ────────────────────────────────────────────────
-- Classes (§5 of the commissioning directive):
--   canonical           already has an ACTIVE owner membership for
--                       organizations.owner_profile_id
--   backfill_eligible   missing membership, exactly one unambiguous owner
--                       (owner_profile_id NOT NULL → that profile, per the
--                       reviewed 20260806090000 backfill rule)
--   no_owner_evidence   missing membership AND owner_profile_id IS NULL —
--                       the migration must NOT invent an owner here
select
  count(*) as total_organizations,
  count(*) filter (where owner_profile_id is not null and has_owner_membership)
    as canonical,
  count(*) filter (where owner_profile_id is not null and not has_owner_membership)
    as backfill_eligible,
  count(*) filter (where owner_profile_id is null)
    as no_owner_evidence
from (
  select o.id, o.owner_profile_id,
         exists (
           select 1 from public.company_memberships m
            where m.organization_id = o.id
              and m.profile_id = o.owner_profile_id
              and m.status in ('invited','active')
         ) as has_owner_membership
  from public.organizations o
) c;

-- ── 2. The exact rows the backfill would touch ──────────────────────────────
-- Expected 2026-08-06: the three QA-SYNTHETIC orgs (Alfa/Beta/Gama) and
-- nothing else. If ANY unexpected row appears here, STOP and reclassify
-- before applying.
select o.id, o.display_name, o.organization_type, o.owner_profile_id, o.created_at
  from public.organizations o
 where o.owner_profile_id is not null
   and not exists (
     select 1 from public.company_memberships m
      where m.organization_id = o.id
        and m.profile_id = o.owner_profile_id
        and m.status in ('invited','active')
   )
 order by o.created_at;

-- ── 3. Ambiguity probe ──────────────────────────────────────────────────────
-- An org would be AMBIGUOUS if a DIFFERENT profile already holds an active
-- owner membership while organizations.owner_profile_id points elsewhere.
-- The backfill's NOT EXISTS is keyed on (org, owner_profile_id) so such a
-- row WOULD gain a second owner — this probe must return 0 before apply.
select count(*) as conflicting_owner_orgs
  from public.organizations o
 where o.owner_profile_id is not null
   and exists (
     select 1 from public.company_memberships m
      where m.organization_id = o.id
        and m.role = 'owner' and m.status = 'active'
        and m.profile_id <> o.owner_profile_id
   )
   and not exists (
     select 1 from public.company_memberships m
      where m.organization_id = o.id
        and m.profile_id = o.owner_profile_id
        and m.status in ('invited','active')
   );

-- ── 4. Invariants the migration relies on ───────────────────────────────────
select
  (select count(*) from pg_indexes
    where schemaname='public' and indexname='company_memberships_live_key')
    as live_key_present,          -- must be 1
  (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where c.relname='organizations' and tgname='on_org_owner_membership_seed')
    as seed_trigger_already_present,  -- must be 0 before apply, 1 after
  (select count(*) from public.company_memberships) as membership_rows_total;

-- ── 5. Fingerprint for the apply record ─────────────────────────────────────
select
  (select count(*) from public.organizations)                as organizations,
  (select count(*) from public.company_memberships
    where status = 'active')                                 as active_memberships,
  (select count(*) from public.company_memberships
    where role = 'owner' and status = 'active')              as active_owner_memberships,
  (select count(*) from public.engagement_contexts)          as engagement_contexts,
  now() as snapshot_at;
