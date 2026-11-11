-- 20261111230000 - notification_events v12: OFFER notification types.
--
-- WHY: a B2B offer reached nobody. When a team (brigade) offered itself to a
-- company need, or an agency proposed a candidate, the company learned of it
-- only by opening the page; when the company answered, the team or agency
-- never learned the answer (Swedish employer audit 2026-11-11, N-1/N-2).
-- Four event types and four entity types on the EXISTING store, by the drop +
-- re-add idiom v2..v11 used. No new table, no scheduler.
--
--   team_offer_received       -> demand owner     (entity team_demand_offer)
--   team_offer_answered       -> who offered      (entity team_demand_offer_response)
--   candidate_offer_received  -> demand owner     (entity agency_candidate_offer)
--   candidate_offer_answered  -> who proposed     (entity agency_candidate_offer_response)
--
-- STRICT SUPERSET: every row valid before is valid after. NO data change, NO
-- RLS change. Two column-scoped service_role reads (see below).
-- ROLLBACK: supabase/rollbacks/20261111230000_offer_notification_types_v1.down.sql
--   (refuses while any offer notification row exists).
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
    'history_link_offered',
    'team_offer_received',
    'team_offer_answered',
    'candidate_offer_received',
    'candidate_offer_answered'
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
    'organization_person',
    'team_demand_offer',
    'team_demand_offer_response',
    'agency_candidate_offer',
    'agency_candidate_offer_response'
  ));

-- RECIPIENT READS, server-side, column-scoped (precedent:
-- 20261012120000_service_role_notification_reads_v1). No other column, no
-- anon/authenticated grant, no policy change.
--   * an offer's recipient is the DEMAND OWNER, whom the offering team or
--     agency cannot read under its own RLS;
--   * a team offer's answer goes to `offered_by`, which the answering company
--     cannot read (team_demand_offers_select_v1 admits the team side only).
grant select (id, profile_id) on public.customer_requests to service_role;
grant select (id, request_id, offered_by) on public.team_demand_offers to service_role;

commit;
