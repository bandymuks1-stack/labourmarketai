-- DOWN / rollback for 20260613200000_billing_test_mode_records.sql
--
-- Drops the three billing tables. Guarded: refuses if billing_subscriptions
-- holds rows, so a real (test) subscription record is never silently discarded.
-- Apply via Supabase MCP apply_migration, never `db push`.

begin;

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'billing_subscriptions')
     and (select count(*) from public.billing_subscriptions) > 0 then
    raise exception 'billing_subscriptions has rows — refusing to drop (handle the data first)';
  end if;
end $$;

drop table if exists public.payment_webhook_events;
drop table if exists public.billing_subscriptions;
drop table if exists public.billing_customers;

commit;
