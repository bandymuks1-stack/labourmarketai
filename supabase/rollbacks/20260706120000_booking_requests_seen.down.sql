-- Rollback for 20260706120000_booking_requests_seen.sql — removes the seen
-- table + RPC completely. App code degrades honestly (0 "new" counts, no
-- badge) when these objects are absent.
begin;

drop function if exists public.mark_booking_requests_seen();
drop table if exists public.booking_requests_seen;

commit;
