-- ============================================================================
-- ROLLBACK for 20260817221000_procurement_v1.sql
--
-- Restores the prior state exactly: drops ONLY the 3 new tables, the 1
-- trigger and the 10 new functions. Feature-created rows live ONLY in those
-- tables, so nothing else changes; no existing object was touched by the up
-- migration, so nothing is recreated here.
--
-- ORDER MATTERS (proven by scripts/db-proof/financial-ops-v1.sh):
--   1. the SELECT policies on procurement_offers / procurement_events depend
--      on procurement_can_view_v1, so the TABLES go first and the visibility
--      helper only afterwards;
--   2. procurement_inquiries.selected_offer_id and procurement_offers.
--      inquiry_id form a circular FK pair, so the added constraint is
--      dropped before either table.
-- ============================================================================

begin;

-- ── 1. Tables (policies + triggers fall with them) ────────────────────────
alter table if exists public.procurement_inquiries
  drop constraint if exists pi_selected_offer_fk;

drop table if exists public.procurement_events;
drop table if exists public.procurement_offers;
drop table if exists public.procurement_inquiries;

-- ── 2. Trigger function (its trigger died with the table above) ───────────
drop function if exists public.procurement_events_guard();

-- ── 3. Commands + the visibility helper (now unreferenced) ────────────────
drop function if exists public.sync_procurement_approval_v1(text);
drop function if exists public.submit_procurement_approval_v1(text);
drop function if exists public.set_procurement_finance_record_v1(text, text);
drop function if exists public.set_procurement_status_v1(text, text, text);
drop function if exists public.select_procurement_offer_v1(text, text, text);
drop function if exists public.add_procurement_offer_v1(text, text, text, text, text);
drop function if exists public.submit_procurement_inquiry_v1(text);
drop function if exists public.update_procurement_inquiry_v1(text, text, text, text);
drop function if exists public.create_procurement_inquiry_v1(text, text, text, text, text, text);
drop function if exists public.procurement_can_view_v1(uuid);

commit;
