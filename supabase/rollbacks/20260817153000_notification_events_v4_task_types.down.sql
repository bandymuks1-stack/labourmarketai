-- Restores the v2 event-type list and the v1 entity-type list. Any
-- v4-typed rows must be deleted first or the constraint re-add fails —
-- stated so the rollback is honest about its cost (the v2 rollback idiom).
--
-- REBASE NOTE (train V2): if the sibling v3 widenings (workflow types,
-- document types) are applied in production, this file must restore THEIR
-- accumulated list instead — recount at rebase, never take this verbatim.
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
