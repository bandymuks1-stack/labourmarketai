-- Rollback for 20260817130100_notification_events_v3_workflow_types.sql
--
-- Restores the v2 constraint set exactly (the state after
-- 20260813100000_notification_events_v2_types.sql). Any workflow_* event
-- rows written while v3 was live would block the narrowing — delete none
-- automatically; the lead decides. This file assumes no such rows exist yet
-- (the engine ships UNAPPLIED alongside it).

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
