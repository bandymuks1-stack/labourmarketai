-- ROLLBACK of 20261021130000_booking_expiry_system_schedule_v1.sql
--
-- Safe at any time: removes the daily job and the system-only function.
-- Bookings already expired stay expired (their events are history); the admin
-- function `expire_stale_booking_requests_v1` is untouched by both directions.

begin;

do $$
begin
  if to_regclass('cron.job') is not null
     and exists (select 1 from cron.job where jobname = 'booking-expiry-daily') then
    perform cron.unschedule('booking-expiry-daily');
  end if;
end $$;

drop function if exists public.expire_stale_booking_requests_system_v1(integer);

commit;
