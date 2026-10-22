-- ROLLBACK of 20261021150000_lmc_purchase_payment_reference_unique_v1.sql
--
-- Removes ONLY the unique index. No ledger row is touched: lmc_transactions is
-- append-only and stays exactly as it is. After this, exactly-once per payment
-- rests on the per-account idempotency key alone (the pre-20261021150000
-- state) — do not arm Stripe top-ups (stripe_lmc_topups_enabled) without it.

begin;

drop index if exists public.lmc_purchase_payment_reference_unique;

commit;
