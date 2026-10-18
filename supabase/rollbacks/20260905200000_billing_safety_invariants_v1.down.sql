-- 20260905200000_billing_safety_invariants_v1.down.sql
-- Reverses the billing safety invariants v1 migration. Every reversal that
-- could lose evidence REFUSES until the operator has archived it — nothing is
-- dropped silently (rollbacks/README.md convention). Apply ONLY via Supabase
-- MCP apply_migration after human approval; never `db push`.

-- 4. billing_checkout_operations — refuse while rows exist (evidence record).
do $$
declare n bigint;
begin
  if to_regclass('public.billing_checkout_operations') is not null then
    execute 'select count(*) from public.billing_checkout_operations' into n;
    if n > 0 then
      raise exception 'ROLLBACK REFUSED: billing_checkout_operations holds % row(s) — archive them first', n;
    end if;
  end if;
end $$;
drop policy if exists billing_checkout_operations_select on public.billing_checkout_operations;
drop table if exists public.billing_checkout_operations;

-- 3. billing_customers — restore unique (owner_id, provider). Refuse if a
--    profile now legitimately holds BOTH a test and a live customer.
do $$
declare n bigint;
begin
  select count(*) into n from (
    select owner_id, provider from public.billing_customers
    group by owner_id, provider having count(*) > 1
  ) d;
  if n > 0 then
    raise exception 'ROLLBACK REFUSED: % owner(s) hold more than one billing customer per provider — the original key cannot be restored without data loss', n;
  end if;
end $$;
alter table public.billing_customers
  drop constraint if exists billing_customers_owner_provider_mode_key;
alter table public.billing_customers
  add constraint billing_customers_owner_id_provider_key unique (owner_id, provider);

-- 2. payment_webhook_events.event_created_at — refuse while values exist.
do $$
declare n bigint;
begin
  select count(*) into n from public.payment_webhook_events where event_created_at is not null;
  if n > 0 then
    raise exception 'ROLLBACK REFUSED: % webhook event(s) carry event_created_at — archive first', n;
  end if;
end $$;
drop index if exists public.payment_webhook_events_created_idx;
alter table public.payment_webhook_events drop column if exists event_created_at;

-- 1. billing_subscriptions evidence columns — refuse while values exist.
do $$
declare n bigint;
begin
  select count(*) into n from public.billing_subscriptions
   where last_event_id is not null or last_event_created_at is not null
      or provider_price_id is not null or unit_amount_cents is not null or currency is not null;
  if n > 0 then
    raise exception 'ROLLBACK REFUSED: % subscription row(s) carry ordering/amount evidence — archive first', n;
  end if;
end $$;
alter table public.billing_subscriptions
  drop column if exists last_event_id,
  drop column if exists last_event_created_at,
  drop column if exists provider_price_id,
  drop column if exists unit_amount_cents,
  drop column if exists currency;
