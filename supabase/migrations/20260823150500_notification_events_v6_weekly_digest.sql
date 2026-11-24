-- ============================================================================
-- 20260823150500 — notification events v6: the weekly personal digest type.
--
-- WHY THIS EXISTS. Value train 2 (Wagon B) builds the ONE personal
-- intelligence loop: USER STATE → WORK JOURNAL / SKILLS → MARKET STATE →
-- RELEVANT CHANGE → EXPLANATION. The explanation already exists as a pure
-- read model (lib/worker/weekly-intelligence-model.ts, PR #1238) — what it
-- lacks is a carrier. `notification_events` is the canonical durable
-- notification store (v1..v5 precedent), so the weekly signal becomes one
-- more event type on the SAME table — never a second scheduler, never a
-- second notification path (train doctrine: ONE notification engine).
--
--   + event_type  'weekly_digest' — recipient: the worker themselves. The
--     row is a POINTER, not a payload: metadata stays empty because §19(d)
--     forbids persisting computed fit counts, and the numbers live where the
--     href lands (the opportunities board recomputes them at read time).
--   + entity_type 'weekly_digest' — href resolves to the EXISTING
--     /dashboard/opportunities surface (no new route). entity_id is a
--     DETERMINISTIC uuid derived from the ISO week
--     (lib/notifications/weekly-digest-emitter.ts), so the emitter's
--     canonical dedupe key `weekly_digest:<uuid(week)>` + the UNIQUE
--     (recipient, dedupe_key) constraint make the digest exactly-once per
--     recipient per ISO week — re-renders, races and retries are no-ops.
--
-- DELIVERY MODEL (no scheduler): the digest row is materialized
-- fire-and-forget on an authenticated dashboard visit, at most once per
-- week, by the same service-role emitter path every other event uses.
-- Workers who do not visit receive nothing — reaching THEM is the email
-- half of the loop, which is deliberately owner-gated behind the
-- notification_preferences decision (unsubscribe/channel consent first).
--
-- SAFETY CLASS: GREEN — constraint WIDENING via the drop + re-add idiom in
-- one file (the PR #321 canonical-green pattern; v2/v3/v4/v5 precedent on
-- this same table). Strictly a superset: every row valid before is valid
-- after. Same table, same RLS, same grants, same dedupe — nothing else
-- changes.
--
-- ROLLBACK: supabase/rollbacks/20260823150500_notification_events_v6_weekly_digest.down.sql
-- (re-adds the v5 lists; any v6-typed rows must be deleted first).
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
    'demand_interest_reviewed',
    'weekly_digest'
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
    'weekly_digest'
  ));
