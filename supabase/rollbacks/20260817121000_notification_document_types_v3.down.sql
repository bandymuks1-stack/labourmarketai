-- Rollback for 20260817121000_notification_document_types_v3.sql
--
-- Restores the v2 (20260813100000) constraint lists. Safe only after the
-- guarded delete below removes rows carrying the v3-only values (they are
-- feature-created rows of the document engine; removing a notification row
-- removes a bell entry, nothing else).

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
    'engagement_ended'
  ));

alter table public.notification_events
  drop constraint notification_events_entity_type_check;

alter table public.notification_events
  add constraint notification_events_entity_type_check check (entity_type in (
    'booking_request',
    'worker_absence',
    'engagement'
  ));

commit;
