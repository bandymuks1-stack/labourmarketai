-- 20261002140000 - notification_events v10: MESSAGE RECEIVED + JOURNAL REVIEW
-- DECIDED types.
--
-- WHY: a new message in a thread, and a manager's decision on a worker's
-- journal entry, are facts the recipient otherwise learns only by opening the
-- right page. Two more event_types and two more entity_types on the EXISTING
-- store, by the drop + re-add idiom v2..v9 used. No new table, no scheduler.
-- Message rows coalesce per thread per 30-minute window in application code
-- (deterministic entity id); nothing here changes the dedupe constraint.
--
-- STRICT SUPERSET: every row valid before is valid after. NO data change, NO
-- RLS change, NO grant.
-- ROLLBACK: supabase/rollbacks/20261002140000_message_journal_review_notification_types_v1.down.sql
--   (refuses while any message_received / journal_review_decided row exists).
-- POST-APPLY: select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conname in ('notification_events_type_check','notification_events_entity_type_check');

begin;

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
    'weekly_digest',
    'saved_search_match',
    'invitation_accepted',
    'job_alert',
    'message_received',
    'journal_review_decided'
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
    'weekly_digest',
    'saved_search',
    'invitation',
    'public_vacancy',
    'conversation',
    'journal_entry'
  ));

commit;
