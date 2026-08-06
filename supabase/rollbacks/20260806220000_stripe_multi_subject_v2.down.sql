-- ROLLBACK for 20260806220000_stripe_multi_subject_v2.sql
--
-- ARCHIVE, NEVER DESTROY: organization subject bindings are billing history.
-- This rollback (1) REFUSES while restoring the old constraint would
-- collide (one payer holding the same plan for several subjects — exactly
-- what v2 legalized), (2) archives every binding, (3) restores the original
-- 20260613200000 shape.

do $$
begin
  if exists (
    select 1 from public.billing_subscriptions
     group by owner_id, plan_key, provider
    having count(*) > 1
  ) then
    raise exception
      'ROLLBACK REFUSED: multiple subscriptions per (owner, plan, provider) exist — the pre-v2 constraint cannot represent them; use a forward fix';
  end if;
end $$;

create table if not exists public.billing_subject_binding_archive (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null,
  organization_id uuid,
  origin_organization_id uuid,
  archived_at     timestamptz not null default now()
);
alter table public.billing_subject_binding_archive enable row level security;
-- no policies: admin/service access only, fail-closed.

insert into public.billing_subject_binding_archive
  (subscription_id, organization_id, origin_organization_id)
select id, organization_id, origin_organization_id
  from public.billing_subscriptions
 where organization_id is not null or origin_organization_id is not null;

drop trigger if exists trg_billing_subscriptions_capture_origin_org
  on public.billing_subscriptions;
drop function if exists public.billing_subscriptions_capture_origin_org();
drop index if exists public.billing_subscriptions_personal_plan_uniq;
drop index if exists public.billing_subscriptions_org_plan_uniq;
drop index if exists public.billing_subscriptions_org_idx;
alter table public.billing_subscriptions drop column if exists organization_id;
alter table public.billing_subscriptions drop column if exists origin_organization_id;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_owner_id_plan_key_provider_key
  unique (owner_id, plan_key, provider);
