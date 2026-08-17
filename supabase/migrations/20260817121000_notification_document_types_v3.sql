-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- OWNER_APPROVAL_REQUIRED_BEFORE_APPLY (apply is performed by the train LEAD
-- via Supabase MCP apply_migration; never `db push`).
-- Gate doc: docs/human-gates/notification-document-types-v3-gate.md
-- Rollback:  supabase/rollbacks/20260817121000_notification_document_types_v3.down.sql
--
-- @human-gate-approved — TIER: owner-gated. Pre-approved by owner mandate
-- 2026-08-17 (autonomous functional completion train V2, §4 migration
-- authority). Safety class: constraint change on the durable notification
-- store (RED because ANY alter/drop-constraint is; the drop + re-add pair
-- strictly WIDENS — every currently-valid row stays valid). Same table,
-- same RLS, same grants, same dedupe. Apply AFTER (or together with)
-- 20260817120000_document_file_layer_v1.sql — the emitters resolve
-- recipients from the document tables that migration creates.
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
    'worker_document',
    'org_document',
    'document_acknowledgement'
  ));
