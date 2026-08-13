-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- OWNER_APPROVAL_REQUIRED_BEFORE_APPLY.
-- Gate doc: docs/human-gates/notification-events-v2-types-gate.md
-- Rollback:  supabase/rollbacks/20260813100000_notification_events_v2_types.down.sql
--
-- @human-gate-approved — TIER: owner-gated (constraint change on the durable
-- notification store; the annotation states the ROUTE, not the decision).
--
-- V8 notification-loop matrix (2026-08-13) found two critical transitions
-- whose counterparty has NO durable awareness:
--   * booking_withdrawn — the company withdraws a proposal; the worker who
--     saw the offer never durably learns it is gone;
--   * engagement_ended — one side ends the relationship; the other side's
--     awareness today is only the row's state on next visit.
-- Both emitters exist code-side behind these type names and stay inert until
-- this constraint admits them. Nothing else changes: same table, same RLS,
-- same grants, same dedupe.
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
    'engagement_ended'
  ));
