-- ============================================================================
-- 20260819110000 — notification events v5: the demand-interest type.
--
-- WHY THIS EXISTS. Production holds FOUR real `demand_interest_signals` rows
-- (2026-07-05) — four workers who read a company's demand and raised their
-- hand. `notification_events` has ZERO lifetime inserts, and no emitter for
-- demand interest exists at all: bookings, engagements, absences, workflows,
-- documents and tasks each have one, and the single event the marketplace is
-- FOR does not. The demand owner learns a candidate exists only if they happen
-- to open /dashboard/company/scouting. A signal nobody hears is not a signal.
--
--   + event_type  'demand_interest_expressed' — recipient: the DEMAND OWNER
--     (`customer_requests.profile_id`), resolved by the emitter from the
--     signal row, never from caller input. That is EXACTLY the set of people
--     `demand_interest_signals_demand_owner_select` already lets read the
--     signal, so the notification tells nobody anything RLS did not already
--     permit them to see.
--   + entity_type 'demand_interest_signal' — href resolves to the EXISTING
--     /dashboard/company/scouting surface (no new route).
--
-- WHAT IT CARRIES. The dedupe key is (event, signal id), so one event per
-- (worker, demand): a worker toggling interest off and on again re-uses the
-- same row and re-notifies nobody. Metadata stays inside the allowlist
-- (`country` only) — the worker's note is FREE TEXT and must never reach a
-- notification row.
--
-- SAFETY CLASS: GREEN — constraint WIDENING via the drop + re-add idiom in one
-- file (the PR #321 canonical-green pattern, and the v2/v3/v4 precedent on
-- this same table). Strictly a superset: every row valid before is valid
-- after. Same table, same RLS, same grants, same dedupe — nothing else changes.
--
-- ROLLBACK: supabase/rollbacks/20260819110000_notification_events_v5_demand_interest.down.sql
-- (re-adds the v4 lists; any v5-typed rows must be deleted first).
-- ============================================================================

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
    'demand_interest_expressed'
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
    'demand_interest_signal'
  ));
