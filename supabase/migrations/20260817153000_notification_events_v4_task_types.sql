-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration by the LEAD session, AFTER
-- 20260817130100_notification_events_v3_workflow_types.sql (this file's
-- lists INCLUDE the v3 workflow types — reconciled after merging
-- origin/main 08121c8d). Never `db push`.
--
-- MERGE-ORDER NOTE (train V2): PR #1169 (document engine) may widen these
-- same two constraints again. Whichever widening applies LAST must carry
-- the FULL accumulated type list — recount at every merge.
--
-- @human-gate-approved — pre-approved by owner mandate 2026-08-17 (autonomous
-- functional completion train V2, §4 migration authority). Safety class:
-- GREEN-idiom constraint WIDENING (drop + re-add in one file, strictly a
-- superset — the 20260813100000 v2 precedent); annotated only because
-- constraint drop/re-add on the durable store is flagged.
--
-- 20260817153000 — notification events v4: the task-assignment type.
--
-- The train-D assign-to-other slice (20260817151000) lets a managing role
-- hand a task to another person. Without a durable type the assignee whose
-- tab is closed never learns a task landed on them — exactly the gap class
-- the durable store exists to close (v2 precedent: booking_withdrawn).
--
--   + event_type  'work_task_assigned' — recipient: the NEW assignee,
--     resolved from the task row by the emitter, never from caller input;
--     never emitted for self-assignment.
--   + entity_type 'work_task' — href resolves to the EXISTING
--     /dashboard/tasks surface (no new route).
--
-- Same table, same RLS, same grants, same dedupe — nothing else changes.
--
-- ROLLBACK: supabase/rollbacks/20260817153000_notification_events_v4_task_types.down.sql
-- (0-row assertion on the new types, then re-adds the v2/v1 lists).
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
    'work_task_assigned'
  ));

alter table public.notification_events
  drop constraint notification_events_entity_type_check;

alter table public.notification_events
  add constraint notification_events_entity_type_check check (entity_type in (
    'booking_request',
    'worker_absence',
    'engagement',
    'workflow_instance',
    'work_task'
  ));
