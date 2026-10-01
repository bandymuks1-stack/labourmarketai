-- 20261001090000 — notification_events v9: the JOB ALERT type (stream N).
--
-- WHY: a registered worker who said what work they want (profession, preferred
-- countries, salary expectation — their existing work card) is told about a
-- REAL active job that fits, in the existing bell, exactly once per job
-- revision. No new table, no new scheduler: one more event_type and one more
-- entity_type on the existing store, by the drop + re-add idiom v2..v8 used.
--
-- STRICT SUPERSET: every row valid before is valid after. NO data change, NO
-- RLS change, NO grant.
-- ROLLBACK: supabase/rollbacks/20261001090000_job_alert_notification_type_v1.down.sql
--   (refuses while any job_alert / public_vacancy row exists).
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
    'job_alert'
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
    'public_vacancy'
  ));

commit;
