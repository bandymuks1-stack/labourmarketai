-- Rollback of 20261013200000 (history_link_offered notification type).
-- Refuses while those rows exist: deleting a person's notifications is not a rollback step.
begin;
do $$
begin
  if exists (select 1 from public.notification_events
              where event_type = 'history_link_offered'
                 or entity_type = 'organization_person') then
    raise exception 'rollback refused: notification_events holds history_link_offered rows';
  end if;
end $$;

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
