-- ROLLBACK for 20260807090000_org_owner_membership_seed_v1
--
-- Structure-only revert: drops the AFTER INSERT seed trigger and its
-- function. Orgs created after this rollback are again born WITHOUT an
-- owner membership (the pre-migration behaviour — i.e. the production
-- defect returns; that is what rolling back means here).
--
-- Seeded ROWS deliberately STAY:
--   * they are DERIVED truth — organizations.owner_profile_id, the source
--     of every seeded row, remains intact, so nothing original is lost by
--     keeping them and nothing original is recovered by deleting them;
--   * deleting an org's only active owner membership is BLOCKED by the
--     protect_last_owner trigger (20260806090000) by design — a data
--     revert here would raise 'last_owner_membership' on the first row;
--   * removing them would re-orphan every affected org's governance spine,
--     recreating the exact 2026-08-06 PROD_QA finding.
-- If the owner ever decides seeded rows must go, that is its own reviewed
-- decision (it requires suspending the last-owner survival guarantee) —
-- never a silent side effect of this file. Seeded rows remain identifiable
-- by source in ('org-create', 'backfill:organizations.owner_profile_id:v2').

do $$
declare
  seeded int;
begin
  if to_regclass('public.company_memberships') is null then
    raise notice 'company_memberships already absent — nothing to roll back';
    return;
  end if;
  select count(*) into seeded
    from public.company_memberships
   where source in ('org-create', 'backfill:organizations.owner_profile_id:v2');
  raise notice
    'org-owner-membership-seed rollback: % seeded row(s) remain by design (derived truth, protected by last-owner survival)',
    seeded;
end $$;

drop trigger if exists on_org_owner_membership_seed on public.organizations;
drop function if exists public.company_memberships_seed_org_owner();
