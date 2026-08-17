-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration, AFTER
-- 20260817120000_workflow_engine_v1.sql. Never `db push`.
-- Gate doc: docs/human-gates/workflow-engine-gate.md
-- Rollback:  supabase/rollbacks/20260817121000_notification_events_v3_workflow_types.down.sql
--
-- @human-gate-approved — TIER: owner-gated (constraint change on the durable
-- notification store; the annotation states the ROUTE, not the decision).
-- Annotation pre-approved by owner mandate 2026-08-17 (autonomous functional
-- completion train V2, §4 migration authority). SAFETY CLASS: RED by the
-- fail-closed scanner (constraint drop+re-add); semantically a pure WIDENING
-- — every previously admitted value stays admitted, zero DML, no RLS/grant
-- change.
--
-- Workflow & Approval Engine v1 emits four durable facts through the
-- EXISTING notification_events spine (model:
-- 20260813100000_notification_events_v2_types.sql):
--   * workflow_step_pending — you are an approver on a step that just
--     became active;
--   * workflow_decided      — your request reached a terminal outcome;
--   * workflow_delegated    — an approval slot was delegated to you;
--   * workflow_escalated    — a step you should know about passed its
--     deadline (marked + notified, NEVER auto-approved).
-- Entity type `workflow_instance` joins the entity vocabulary. The emitters
-- exist code-side behind these names and stay inert until this constraint
-- admits them. Nothing else changes: same table, same RLS, same grants,
-- same dedupe.
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
    'workflow_escalated'
  ));

alter table public.notification_events
  drop constraint notification_events_entity_type_check;

alter table public.notification_events
  add constraint notification_events_entity_type_check check (entity_type in (
    'booking_request',
    'worker_absence',
    'engagement',
    'workflow_instance'
  ));
