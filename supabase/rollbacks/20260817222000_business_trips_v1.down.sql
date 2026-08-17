-- ============================================================================
-- ROLLBACK for 20260817222000_business_trips_v1.sql
--
-- Restores the prior state exactly: drops ONLY the 1 trigger, 8 new
-- functions, the additive finance_records.trip_id column (+ its partial
-- index) and the 2 new tables. Feature-created rows live ONLY in those
-- tables/column; no existing object was otherwise touched by the up
-- migration, so nothing is recreated here. Data note: dropping trip_id
-- discards any expense↔trip links made while the up migration was live —
-- that IS the rollback semantics of an additive-column slice, stated
-- honestly.
-- ============================================================================

begin;

drop function if exists public.set_finance_record_trip_v1(text, text);
drop function if exists public.cancel_business_trip_v1(text);
drop function if exists public.complete_business_trip_v1(text);
drop function if exists public.sync_business_trip_decision_v1(text);
drop function if exists public.submit_business_trip_v1(text);
drop function if exists public.update_business_trip_v1(text, text, text, text, text, text);
drop function if exists public.create_business_trip_v1(text, text, text, text, text, text, text);

drop index if exists public.fr_trip_idx;
alter table if exists public.finance_records drop column if exists trip_id;

drop function if exists public.business_trip_can_view_v1(uuid);

drop trigger if exists business_trip_events_append_only on public.business_trip_events;
drop function if exists public.business_trip_events_guard();

drop table if exists public.business_trip_events;
drop table if exists public.business_trips;

commit;
