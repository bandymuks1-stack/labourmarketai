-- Rollback 20261114100000_booking_refuses_closed_need_v1: remove the trigger
-- and its function. No data was changed by the forward migration, so nothing
-- is restored; bookings refused while it was installed stay as they were.
begin;
drop trigger if exists booking_requests_open_need_guard on public.booking_requests;
drop function if exists public.booking_requests_open_need_guard();
commit;
