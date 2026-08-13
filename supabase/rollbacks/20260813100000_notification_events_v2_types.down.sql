-- Restores the v1 type list. Any v2-typed rows must be deleted first or the
-- constraint re-add fails — stated so the rollback is honest about its cost.
alter table public.notification_events
  drop constraint notification_events_type_check;
alter table public.notification_events
  add constraint notification_events_type_check check (event_type in (
    'booking_proposed',
    'booking_accepted',
    'booking_declined',
    'absence_requested',
    'absence_approved',
    'absence_rejected',
    'engagement_created'
  ));
