-- ============================================================================
-- ROLLBACK for 20260817221000_procurement_v1.sql
--
-- Restores the prior state exactly: drops ONLY the 1 trigger, 10 new
-- functions and 3 new tables. Feature-created rows live ONLY in those
-- tables, so nothing else changes; no existing object was touched by the up
-- migration, so nothing is recreated here.
-- ============================================================================

begin;

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

drop trigger if exists procurement_events_append_only on public.procurement_events;
drop function if exists public.procurement_events_guard();

-- The selected-offer FK sits on inquiries → offers; drop tables in
-- dependency order (events → offers needs the FK gone first, so the
-- inquiries constraint is removed with its table last after offers).
drop table if exists public.procurement_events;
alter table if exists public.procurement_inquiries
  drop constraint if exists pi_selected_offer_fk;
drop table if exists public.procurement_offers;
drop table if exists public.procurement_inquiries;

commit;
