-- @human-gate-approved
-- ============================================================================
-- 20260919200000_notification_events_v9_journal_confirmed
-- RED — owner gate (R-6 of the 2026-09-19 completion audit). PREPARED, NOT
-- APPLIED. The annotation above acknowledges the class; it is not approval.
--
-- FINDING (traced on production 2026-09-19): when a manager confirms a
-- worker's journal entry (`review_journal_entry` / `confirm_entry_and_verify_
-- skills`) nothing tells the worker. There is no durable notification_events
-- row (the v8 CHECK has no journal type and no journal entity), no bell row,
-- no activity-feed row, no e-mail. The worker learns it only by visiting
-- /dashboard/journal (status badge) or from the 7-day line in the opening
-- brief. The symmetric worker-facing case — `demand_interest_reviewed` —
-- already has a durable event; a confirmed day of work is the stronger fact
-- (REAL WORK → EVIDENCE → IDENTITY) and has none.
--
-- The second half of the old R-6 packet — a `conversation_message` event —
-- is CLOSED without a migration: the unread-message count already drives the
-- bell row and the Messages badge with honest semantics; a durable duplicate
-- would put one fact in two surfaces that clear differently.
--
-- MINIMUM CHANGE: v9 of the two CHECKs — ONE event type
-- `journal_entry_confirmed` and ONE entity type `journal_entry`. Widening
-- only; the canonical GREEN fixture class this table has used eight times.
-- The emitter (code) writes one row to the WORKER (never to the confirming
-- manager), keyed on the entry id — with UNIQUE (recipient, dedupe_key) a
-- re-confirmation of the same entry notifies once. href → /dashboard/journal,
-- where the confirmed badge already renders.
--
-- BLAST RADIUS: two constraint swaps on notification_events; zero row
-- changes (every existing row satisfies the wider set by construction).
-- ROLLBACK: DOWN restores the v8 lists verbatim — it will fail if a v9 row
-- exists, which is the correct fail-closed behaviour for a CHECK narrowing;
-- delete the v9 rows first (they are notifications, not evidence).
-- ============================================================================

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
    'journal_entry_confirmed'
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
    'journal_entry'
  ));

commit;
