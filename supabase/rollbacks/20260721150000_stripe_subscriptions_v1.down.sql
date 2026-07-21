-- Rollback for 20260721150000_stripe_subscriptions_v1.sql
-- Removes the organization linkage column from billing_subscriptions.
--
-- SAFETY: refuses to drop while any subscription still carries an
-- organization linkage — the operator must null the column deliberately
-- first (or accept the loss explicitly by editing this guard).

do $$
declare
  linked_count bigint;
begin
  select count(*) into linked_count
  from public.billing_subscriptions
  where organization_id is not null;

  if linked_count > 0 then
    raise exception
      'Refusing rollback: % billing_subscriptions rows still carry organization_id. Null them deliberately first.',
      linked_count;
  end if;
end $$;

drop index if exists public.billing_subscriptions_org_idx;

alter table public.billing_subscriptions
  drop column if exists organization_id;
