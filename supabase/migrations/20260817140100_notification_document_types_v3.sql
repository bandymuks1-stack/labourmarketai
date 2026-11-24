-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- OWNER_APPROVAL_REQUIRED_BEFORE_APPLY (apply is performed by the train LEAD
-- via Supabase MCP apply_migration; never `db push`).
-- Gate doc: docs/human-gates/notification-document-types-v3-gate.md
-- Rollback:  supabase/rollbacks/20260817140100_notification_document_types_v3.down.sql
--
-- @human-gate-approved — TIER: owner-gated. Pre-approved by owner mandate
-- 2026-08-17 (autonomous functional completion train V2, §4 migration
-- authority). Safety class: constraint change on the durable notification
-- store (RED because ANY alter/drop-constraint is; the drop + re-add pair
-- strictly WIDENS — every currently-valid row stays valid). Same table,
-- same RLS, same grants, same dedupe.
--
-- ORDER + UNION (renamed from the 20260817121000 slot after trains A/B
-- claimed 120000–130100 on main): this file runs AFTER Train B's
-- 20260817130100_notification_events_v3_workflow_types.sql and BUILDS ON
-- ITS LIST — the re-added constraints below are the UNION of the nine v2
-- types, B's four workflow types and this train's three document types
-- (entities likewise: the v2 three + workflow_instance + the three document
-- entities). Apply order: 20260817130000 → 20260817130100 →
-- 20260817140000_document_file_layer_v1 → this file. (At the time of
-- writing 130100's widening is itself still PENDING APPLY in production;
-- applying in the order above keeps every step strictly widening.)
--
-- Document & Evidence Engine v1 adds three durable facts a person must not
-- miss while offline:
--   * document_ack_assigned  — you were asked to confirm you read a
--     document version;
--   * document_ack_completed — the person you asked has confirmed;
--   * document_expiring      — a document's validity enters the 30-day
--     window (the audit's "expiry PARTIAL: no reminder type" gap).
-- Entity types widen accordingly: worker_document, org_document,
-- document_acknowledgement — all resolving to the EXISTING
-- /dashboard/documents route (no new surface).
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
    'document_expiring'
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
    'document_acknowledgement'
  ));
