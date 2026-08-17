-- Rollback for 20260817140100_notification_document_types_v3.sql
--
-- Restores the constraint lists exactly as Train B's
-- 20260817130100_notification_events_v3_workflow_types.sql leaves them
-- (v2's nine types + the four workflow types; entities incl.
-- workflow_instance). Safe only after the guarded delete below removes rows
-- carrying the document-only values (they are feature-created rows of the
-- document engine; removing a notification row removes a bell entry,
-- nothing else).

begin;

delete from public.notification_events
 where event_type in
   ('document_ack_assigned','document_ack_completed','document_expiring');

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
    'workflow_escalated'
  ));

alter table public.notification_events
  drop constraint notification_events_entity_type_check;

alter table public.notification_events
  add constraint notification_events_entity_type_check check (entity_type in (
    'booking_request',
    'worker_absence',
    'engagement',
    'workflow_instance'
  ));

commit;
