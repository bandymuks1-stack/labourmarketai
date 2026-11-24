-- ============================================================================
-- ROLLBACK for 20260817222000_business_trips_v1.sql
--
-- Restores the prior state exactly: drops ONLY the additive
-- finance_records.trip_id column (+ its partial index), the 2 new tables,
-- the 1 trigger and the 8 new functions. Feature-created rows live ONLY in
-- those tables/column; no existing object was otherwise touched by the up
-- migration, so nothing is recreated here. Data note: dropping trip_id
-- discards any expense↔trip links made while the up migration was live —
-- that IS the rollback semantics of an additive-column slice, stated
-- honestly.
--
-- ORDER MATTERS (proven by scripts/db-proof/financial-ops-v1.sh):
--   1. finance_records.trip_id has an FK to business_trips, so the COLUMN
--      goes before the table;
--   2. the SELECT policy on business_trip_events depends on
--      business_trip_can_view_v1, so the TABLES go before that helper.
-- ============================================================================

begin;

-- ── 1. The additive finance column (FK holder) ────────────────────────────
drop index if exists public.fr_trip_idx;
alter table if exists public.finance_records drop column if exists trip_id;

-- ── 2. Tables (policies + triggers fall with them) ────────────────────────
drop table if exists public.business_trip_events;
drop table if exists public.business_trips;

-- ── 3. Trigger function (its trigger died with the table above) ───────────
drop function if exists public.business_trip_events_guard();

-- ── 4. Commands + the visibility helper (now unreferenced) ────────────────
drop function if exists public.set_finance_record_trip_v1(text, text);
drop function if exists public.cancel_business_trip_v1(text);
drop function if exists public.complete_business_trip_v1(text);
drop function if exists public.sync_business_trip_decision_v1(text);
drop function if exists public.submit_business_trip_v1(text);
drop function if exists public.update_business_trip_v1(text, text, text, text, text, text);
drop function if exists public.create_business_trip_v1(text, text, text, text, text, text, text);
drop function if exists public.business_trip_can_view_v1(uuid);

commit;
