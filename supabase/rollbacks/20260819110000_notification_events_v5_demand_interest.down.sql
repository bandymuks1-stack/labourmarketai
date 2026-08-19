-- Restores the v4 lists (the state after 20260817153000). Any row typed
-- 'demand_interest_expressed' / 'demand_interest_signal' must be deleted
-- first or the constraint re-add fails — stated so the rollback is honest
-- about its cost (the v2/v3/v4 rollback idiom).
--
--   delete from public.notification_events
--    where event_type = 'demand_interest_expressed';
--
-- is the operator's explicit step; this file does NOT delete data on its own.
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
    'work_task_assigned'
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
    'work_task'
  ));
