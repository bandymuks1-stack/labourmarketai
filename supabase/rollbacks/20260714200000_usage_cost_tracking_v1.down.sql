-- Rollback for 20260714200000_usage_cost_tracking_v1.sql (manual, owner-gated).
-- Drops the usage/credits/cost tracking tables. Only run on hard failure —
-- usage_events and credit_ledger are append-only audit trails.
begin;

drop policy if exists credit_ledger_select on public.credit_ledger;
drop policy if exists credit_balances_select on public.credit_balances;
drop policy if exists credit_types_select on public.credit_types;
drop policy if exists usage_events_select on public.usage_events;
drop policy if exists usage_categories_select on public.usage_categories;
drop index if exists credit_ledger_profile_idx;
drop index if exists usage_events_occurred_idx;
drop index if exists usage_events_profile_idx;
drop table if exists public.credit_ledger;
drop table if exists public.credit_balances;
drop table if exists public.credit_types;
drop table if exists public.usage_events;
drop table if exists public.usage_categories;

commit;
