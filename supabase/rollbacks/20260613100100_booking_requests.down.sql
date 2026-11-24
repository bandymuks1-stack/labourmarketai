-- DOWN / rollback for 20260613100100_booking_requests.sql
--
-- Drops the booking RPCs + event log + booking_requests table. Guarded: refuses
-- if booking_requests holds rows, so real commitments are never silently
-- discarded (§3). Apply via Supabase MCP apply_migration, never `db push`.

begin;

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'booking_requests')
     and (select count(*) from public.booking_requests) > 0 then
    raise exception 'booking_requests has rows — refusing to drop (handle the data first)';
  end if;
end $$;

drop function if exists public.withdraw_booking_request(uuid);
drop function if exists public.respond_booking_request(uuid, text);
drop function if exists public.propose_booking_request(uuid, uuid, text, text, text, text, text);
drop table if exists public.booking_request_events;
drop table if exists public.booking_requests;

commit;
