-- @human-gate-approved — owner decision 2026-10-21 item 6 (issue #2628, MDD-03 context): "exactly once per Stripe payment id must be enforced by the DATABASE". Scope: this one unique index only.
-- Conditions: NOT applied by this PR; apply only via Supabase MCP apply_migration after the owner approves this exact file, with the preflight below run first.
--
-- SAFETY CLASS: RED (money ledger — a new uniqueness rule on public.lmc_transactions).
-- Draft PR + needs-human-gate. The marker is the risk acknowledgement the
-- static gate reads, not an approval.
--
-- 20261021150000 — ONE PURCHASED CREDIT PER PAYMENT REFERENCE (LMC train Wagon 4)
--
-- WHY: `lmc_record_purchase_v1` (20260720190000) is idempotent per
-- (account_id, idempotency_key) — constraint `lmc_tx_idempotency`. A Stripe
-- top-up credits with key `stripe_pi:<payment_intent>` and reference
-- `<payment_intent>`. If the SAME payment were ever presented for a DIFFERENT
-- subject (tampered metadata, a bug, an operator replay against the wrong
-- account) the per-account key would not collide, and one payment would
-- credit two wallets. Owner order 2026-10-21: "Neleisk dvigubai suteikti
-- kreditų" — never grant credits twice.
--
-- WHAT THIS ADDS (nothing else changes):
--   * a partial UNIQUE index over the purchase entry's payment reference —
--     `metadata->>'reference'`, exactly where `lmc_record_purchase_v1` stores
--     `p_reference` (jsonb_build_object('reference', p_reference)) — for
--     `kind = 'purchased'` rows only. Promotional, admin, spend, reversal and
--     compensation rows are untouched.
--   * A second insert for an already-credited reference fails inside the RPC
--     with SQLSTATE 23505 naming `lmc_purchase_payment_reference_unique`; the
--     transaction (ledger row + lot + audit row) rolls back as one unit, and
--     the application maps it to `already_credited`
--     (apps/web/lib/lmc/topup-settlement.ts).
--
-- No function, grant, policy, RLS or data change. No row is written.
--
-- PREFLIGHT (read-only, before apply): the index cannot be built over
-- duplicates, so first confirm
--   select metadata->>'reference', count(*) from public.lmc_transactions
--    where kind = 'purchased' group by 1 having count(*) > 1;
-- returns 0 rows (production held 0 lmc_transactions rows at the last audit).
--
-- ROLLBACK (down): supabase/rollbacks/20261021150000_lmc_purchase_payment_reference_unique_v1.down.sql
--   drop index if exists public.lmc_purchase_payment_reference_unique;

begin;

create unique index if not exists lmc_purchase_payment_reference_unique
  on public.lmc_transactions ((metadata->>'reference'))
  where kind = 'purchased';

comment on index public.lmc_purchase_payment_reference_unique is
  'One purchased-credit entry per payment reference (Stripe payment intent) across ALL accounts — LMC train Wagon 4, 20261021150000.';

commit;
