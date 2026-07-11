-- Rollback for 20260711290000_booking_lifecycle_v2.sql — drops ONLY what that
-- migration created and restores the original event_type CHECK. The v1
-- booking RPCs are untouched. Apply manually via Supabase MCP after owner
-- approval, never `db push`.
--
-- NOTE: restore of the narrow event_type CHECK requires that no
-- 'rescheduled' / 'deadline_set' events exist (delete of audit rows is NOT
-- performed automatically — the events ledger is append-only truth). If v2
-- events exist, keep the widened CHECK and roll back functions/columns only.

begin;

drop function if exists public.expire_stale_booking_requests_v1(integer);
drop function if exists public.set_booking_response_deadline_v1(uuid, date);
drop function if exists public.reschedule_booking_proposal_v1(uuid, date, date, text);
drop function if exists public.withdraw_booking_request_v2(uuid, text, text);
drop function if exists public.respond_booking_request_v2(uuid, text, text, text);

alter table public.booking_requests
  drop column if exists response_deadline_date;

alter table public.booking_request_events
  drop column if exists reason_kind,
  drop column if exists reason_note;

alter table public.booking_request_events
  drop constraint if exists booking_request_events_event_type_check;
alter table public.booking_request_events
  add constraint booking_request_events_event_type_check
  check (event_type in ('proposed','accepted','declined','withdrawn','expired'));

commit;
