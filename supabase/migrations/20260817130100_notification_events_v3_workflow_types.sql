-- ============================================================================
-- ALREADY APPLIED — MUST NOT BE APPLIED AGAIN. (Recorded 2026-09-14, owner
-- decision 4a.) Applied to production TOGETHER WITH
-- 20260817140100_notification_document_types_v3.sql as ONE ledger row:
--     notification_types_union_workflow_document_v3  (version 20260817172306)
-- Canonical accounting: REVIEWED_APPLY_SHAPES in
-- apps/web/lib/migrations/parity-model.ts (kind: "union"); the drift was first
-- recorded in the 2026-08-19 correction block at the head of
-- docs/APPLIED_LEDGER.md.
-- Verified read-only on production gorgitwvdzxbnaxhrsrw 2026-09-14:
-- notification_events_type_check ALREADY admits workflow_step_pending,
-- workflow_decided, workflow_delegated and workflow_escalated, and
-- notification_events_entity_type_check ALREADY admits workflow_instance —
-- precisely what this file adds. Its drop-and-re-add of those constraints is
-- therefore a no-op at best and a live-constraint churn at worst.
--
-- The `@human-gate-approved` annotation below is STALE: the work it authorised
-- was completed by the union route above. It is retained (never rewritten) so
-- the original authorisation stays legible, but it authorises NOTHING now.
-- ============================================================================
-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration, AFTER
-- 20260817130000_workflow_engine_v1.sql. Never `db push`.
-- Gate doc: docs/human-gates/workflow-engine-gate.md
-- Rollback:  supabase/rollbacks/20260817130100_notification_events_v3_workflow_types.down.sql
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
