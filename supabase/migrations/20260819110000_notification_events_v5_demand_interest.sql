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
-- THE LOOP RUNS BOTH WAYS. Three types ship together on purpose: telling the
-- company a candidate appeared while leaving the candidate in silence would be
-- an asymmetry in favour of the larger party, which is the one thing doctrine
-- §1 exists to prevent. A worker who raises their hand and hears nothing is the
-- most common way a labour market wastes a person's hope.
--
--   + event_type  'demand_interest_expressed' — recipient: the DEMAND OWNER
--     (`customer_requests.profile_id`), resolved by the emitter from the
--     signal row, never from caller input. That is EXACTLY the set of people
--     `demand_interest_signals_demand_owner_select` already lets read the
--     signal, so the notification tells nobody anything RLS did not already
--     permit them to see.
--   + event_type  'demand_interest_reviewed' — recipient: the WORKER who
--     raised their hand, resolved from the signal's own worker row. Emitted
--     only when `acknowledge_demand_interest` actually changed something, so
--     the worker is never told about a no-op.
--
--     NOT the 'contacted' status, deliberately. That status is set only after
--     `contact-interested-worker` has opened a REAL conversation thread, and a
--     new thread already reaches the worker through the existing unread-message
--     signal. A second bell for one act is noise, and the message itself is the
--     better notification. 'reviewed' is the one that had no carrier: it is the
--     difference between silence and "someone actually looked".
--   + entity_type 'demand_interest_signal' — href resolves to the EXISTING
--     /dashboard/company/scouting surface (no new route).
--   + entity_type 'demand_interest_response' — the SAME signal row seen from
--     the worker's side, which is why it is a second entity type rather than a
--     second table: href resolves to the EXISTING /dashboard/opportunities,
--     where "Mano susidomėjimai" already renders their own interests. Routing
--     both directions through one entity type would send the worker to a
--     company page they cannot open.
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
    'demand_interest_expressed',
    'demand_interest_reviewed'
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
    'demand_interest_response'
  ));
