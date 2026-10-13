-- 20261013200000 - notification_events v11: HISTORY LINK OFFERED type.
--
-- WHY: an organization can offer to connect its recorded work history (a
-- roster person, `organization_people`) to a person's account
-- (`offerRosterLink` -> link_state 'link_proposed'). Only the person can
-- accept, and nothing told them the offer existed: the answer lived only on
-- their own profile page. Production 2026-10-13: the one open offer, holding
-- 313 records / 2,736 h of that person's documented work, had waited 22 days
-- unanswered. One more event_type and entity_type on the EXISTING store, by
-- the drop + re-add idiom v2..v10 used. No new table, no scheduler.
--
-- STRICT SUPERSET: every row valid before is valid after. NO data change, NO
-- RLS change, NO grant.
-- ROLLBACK: supabase/rollbacks/20261013200000_roster_link_offered_notification_type_v1.down.sql
--   (refuses while any history_link_offered / organization_person row exists).
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
    'journal_review_decided',
    'history_link_offered'
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
    'journal_entry',
    'organization_person'
  ));

commit;
