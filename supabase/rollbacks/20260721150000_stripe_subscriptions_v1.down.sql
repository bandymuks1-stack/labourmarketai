-- Rollback for 20260721150000_stripe_subscriptions_v1.sql
-- Restores the pre-migration uniqueness model and removes the organization
-- linkage column, the origin snapshot column, and the capture trigger from
-- billing_subscriptions.
--
-- SAFETY: refuses to run while any subscription is org-associated — either a
-- live linkage (organization_id) OR an orphaned org row (origin_organization_id
-- retained after the org was deleted). Restoring `unique (owner_id, plan_key,
-- provider)` over rows that legitimately share (owner, plan) across (former)
-- organizations would fail or force data loss. The operator must resolve those
-- rows deliberately first.

do $$
declare
  linked_count bigint;
begin
  select count(*) into linked_count
  from public.billing_subscriptions
  where organization_id is not null
     or origin_organization_id is not null;

  if linked_count > 0 then
    raise exception
      'Refusing rollback: % billing_subscriptions rows are org-associated (organization_id or origin_organization_id). Resolve them deliberately first.',
      linked_count;
  end if;
end $$;

drop trigger if exists trg_billing_subscriptions_capture_origin_org
  on public.billing_subscriptions;
drop function if exists public.billing_subscriptions_capture_origin_org();

drop index if exists public.billing_subscriptions_org_plan_uniq;
drop index if exists public.billing_subscriptions_personal_plan_uniq;
drop index if exists public.billing_subscriptions_org_idx;

alter table public.billing_subscriptions
  drop column if exists origin_organization_id;

alter table public.billing_subscriptions
  drop column if exists organization_id;

-- Restore the original 20260613200000 uniqueness constraint (safe: the guard
-- above proved no org-associated rows exist, so no (owner, plan) duplicates can
-- remain that would violate it).
alter table public.billing_subscriptions
  add constraint billing_subscriptions_owner_id_plan_key_provider_key
    unique (owner_id, plan_key, provider);
