-- Restores the accumulated v3 lists (workflow + document types — the
-- state after 20260817130100 and 20260817140100). Any v4-typed rows must
-- be deleted first or the constraint re-add fails — stated so the
-- rollback is honest about its cost (the v2 rollback idiom).
--
-- MERGE NOTE (train V2): reconciled after merging origin/main 1450ed08 —
-- recount before use if the constraints widen again.
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
    'document_expiring'
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
    'document_acknowledgement'
  ));
