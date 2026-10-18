-- Rollback for 20260915180000_subject_contest_and_clash_receipt.sql
-- RED #4 + RED #5. Removes two AUTHORITIES and the receipts they made
-- possible. Nothing that predates the migration is touched.

begin;

-- ── Part B: the clash receipt ────────────────────────────────────────────
drop function if exists public.respond_booking_request_v4(uuid, text, text, text, boolean);

-- Only rows this migration made writable at all. Every pre-existing
-- booking_request_events row has a different event_type and survives.
delete from public.booking_request_events where event_type = 'clash_acknowledged';

alter table public.booking_request_events
  drop constraint if exists booking_request_events_clash_receipt;

alter table public.booking_request_events
  drop constraint if exists booking_request_events_event_type_check;

alter table public.booking_request_events
  add constraint booking_request_events_event_type_check
  check (event_type = any (array[
    'proposed', 'accepted', 'declined', 'withdrawn',
    'expired', 'rescheduled', 'deadline_set'
  ]));

alter table public.booking_request_events
  drop column if exists related_booking_request_id;

-- ── Part A: the subject contest ──────────────────────────────────────────
-- Removing the POLICY removes the ability to write a NEW dispute. Disputes
-- already written stay in place and stay readable — a rollback must not
-- delete a person's statement about a record concerning them.
drop index if exists public.organization_evidence_events_one_dispute_per_actor;

drop policy if exists "organization_evidence_events_subject_dispute"
  on public.organization_evidence_events;

commit;
