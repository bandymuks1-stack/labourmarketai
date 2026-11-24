-- 0035 — Org-owner engagement_context backfill + trigger (additive).
--
-- WHY: companies / agencies created AFTER migration 0013 receive a mirror
-- public.organizations row via the 0013 mirror triggers, but NO 'owner'
-- engagement_context is created for the org owner. The 0013 backfill that
-- created owner engagements ran once. Consequence: post-0013 owners have no
-- owner/manager engagement, so public.manages_organization() is false for them
-- and they CANNOT review their own organization's work journal — the
-- manager-review chain (migration 0034: review_journal_entry /
-- reviewable_journal_entry_ids) is unreachable, and the worker-side bridge
-- (0032) alone is not enough. This migration closes that gap.
--
-- WHAT (additive, idempotent — no drops, renames, RLS or grant changes, no
-- fake data beyond the owner's own legitimate 'owner' engagement):
--   (a) public.ensure_org_owner_engagement() + AFTER INSERT trigger on
--       public.organizations — every newly mirrored org gets its owner an
--       active 'owner' engagement_context (idempotent).
--   (b) a one-time backfill that inserts the missing 'owner' engagement for
--       every existing organization whose owner has none.
--
-- This mirrors the original 0013 owner-engagement shape exactly
-- (relationship_slug = 'owner', is_primary = false, status = 'active',
-- hash_self = sha256(owner:org)). It never creates a worker, company, agency,
-- journal entry, confirmation, or any 'employee'/manager-of-someone-else link;
-- it only gives an organization's own owner the 'owner' engagement that the
-- 0013 backfill would have created had the org existed then.
--
-- SAFETY: SECURITY DEFINER trigger fn with fixed search_path; INSERT guarded by
-- NOT EXISTS (no duplicates, safe re-run); country_code validated against
-- public.countries (invalid/missing → NULL, no FK error); no DELETE/UPDATE/DROP/
-- RENAME, no RLS/policy/grant change, no email/payment/outbound.
--
-- Application status: file ships in this PR. Application to prod is owner-gated.

-- ── (a) trigger: create the owner engagement when an org is inserted ─────
create or replace function public.ensure_org_owner_engagement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_profile_id is not null then
    insert into public.engagement_contexts
      (profile_id, organization_id, relationship_slug, is_primary, status,
       country_code, hash_self)
    select
      new.owner_profile_id, new.id, 'owner', false, 'active',
      (select c.code from public.countries c where c.code = new.country),
      encode(extensions.digest(
        new.owner_profile_id::text || ':owner:' || new.id::text, 'sha256'), 'hex')
    where not exists (
      select 1 from public.engagement_contexts ec
      where ec.profile_id = new.owner_profile_id
        and ec.organization_id = new.id
        and ec.relationship_slug = 'owner'
    );
  end if;
  return new;
end $$;

drop trigger if exists on_org_owner_engagement on public.organizations;
create trigger on_org_owner_engagement
  after insert on public.organizations
  for each row execute function public.ensure_org_owner_engagement();

-- ── (b) backfill existing orgs missing their owner engagement ────────────
insert into public.engagement_contexts
  (profile_id, organization_id, relationship_slug, is_primary, status,
   country_code, hash_self)
select
  o.owner_profile_id, o.id, 'owner', false, 'active',
  (select c.code from public.countries c where c.code = o.country),
  encode(extensions.digest(
    o.owner_profile_id::text || ':owner:' || o.id::text, 'sha256'), 'hex')
from public.organizations o
where o.owner_profile_id is not null
  and not exists (
    select 1 from public.engagement_contexts ec
    where ec.profile_id = o.owner_profile_id
      and ec.organization_id = o.id
      and ec.relationship_slug = 'owner'
  );
