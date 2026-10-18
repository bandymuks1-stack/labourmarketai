-- Rollback for 20260914140000_worker_saved_searches_v1.sql
--
-- READ BEFORE APPLYING. Dropping `worker_saved_searches` DESTROYS every
-- question a worker saved. That is real user data, not scaffolding, so the
-- drop below is guarded: it refuses while the table holds rows, and a
-- deliberate teardown must empty it first (having decided that losing those
-- searches is acceptable, and told the people whose searches they are).
--
-- The notification constraints are restored to their v6 lists. Any row typed
-- `saved_search_match` must be deleted first, or the ADD CONSTRAINT fails —
-- which is the correct failure: silently dropping notifications a person has
-- already been shown is worse than a loud error.

-- ONE TRANSACTION, and that is load-bearing. Measured on a real server while
-- writing the paired proof: with the guard as a bare `do $$ … raise
-- exception … $$` outside a transaction, psql aborted that statement and then
-- happily ran the drops below — the guard printed its refusal AND the table
-- was destroyed anyway. Wrapping the file makes the refusal actually refuse.
begin;

do $$
declare n integer;
begin
  select count(*) into n from public.worker_saved_searches;
  if n > 0 then
    raise exception
      'worker_saved_searches still holds % saved search(es) — empty it deliberately before rolling back', n;
  end if;
end $$;

drop function if exists public.mark_worker_search_seen_v1(uuid);
drop function if exists public.delete_worker_search_v1(uuid);
drop function if exists public.save_worker_search_v1(text, jsonb, boolean);
drop table if exists public.worker_saved_searches;

alter table public.notification_events
  drop constraint notification_events_type_check;
alter table public.notification_events
  add constraint notification_events_type_check check (event_type in (
    'booking_proposed',
    'booking_accepted',
    'booking_declined',
    'booking_withdrawn',
    'absence_requested',
    'absence_approved',
    'absence_rejected',
    'engagement_created',
    'engagement_ended',
    'workflow_step_pending',
    'workflow_decided',
    'workflow_delegated',
    'workflow_escalated',
    'document_ack_assigned',
    'document_ack_completed',
    'document_expiring',
    'work_task_assigned',
    'demand_interest_expressed',
    'demand_interest_reviewed',
    'weekly_digest'
  ));

alter table public.notification_events
  drop constraint notification_events_entity_type_check;
alter table public.notification_events
  add constraint notification_events_entity_type_check check (entity_type in (
    'booking_request',
    'worker_absence',
    'engagement',
    'workflow_instance',
    'worker_document',
    'org_document',
    'document_acknowledgement',
    'work_task',
    'demand_interest_signal',
    'demand_interest_response',
    'weekly_digest'
  ));

commit;
