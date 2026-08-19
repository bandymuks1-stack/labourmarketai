-- ============================================================================
-- 20260819210000 — route work_task through the CANONICAL approval engine
-- (field-work operating platform audit v1, chain step B).
--
-- SAFETY CLASS: GREEN. This is the CHECK-WIDENING idiom the migration-safety
-- gate recognises (drop + re-add an IN-list in the SAME file, exactly like
-- 20260612130000_widen_original_language_ru): every existing row stays valid,
-- nothing is removed, no privilege changes, no SECURITY DEFINER function is
-- created or replaced, no policy is touched, no DML runs. Deliberately NOT
-- `@human-gate-approved` — it does not need to be.
--
-- PROBLEM (measured on production 2026-08-19): the workflow engine
-- (20260817130000) is fully built — definitions, published versions, approver
-- resolution, decide / delegate / withdraw / cancel, overdue marking, an
-- append-only transition log — and its `context_entity_type` enum admits ten
-- kinds of thing. `work_task` is not one of them. So the ONE object the whole
-- field-work chain revolves around is the one object that cannot be sent for
-- approval, and 16 seeded workflow definitions have produced 0 instances.
--
-- WHY THIS IS THE WHOLE CHANGE: `start_workflow_instance_v1` is
-- TYPE-AGNOSTIC. It reads `context_entity_type` from the definition and never
-- switches on it — there is no per-type branch, no per-type table lookup, no
-- per-type authority rule to extend. Verified by reading the function body.
-- Widening the two CHECKs is therefore sufficient at the database layer, and
-- no existing function body is replaced (which is what would have made this
-- RED).
--
-- WHAT IS DELIBERATELY NOT ADDED: no task-specific approval table, no second
-- decision store, no change to any workflow RPC, no default work_task
-- template installed (an org authors one through the EXISTING
-- create_workflow_definition_v1 — a seeded template would be a product
-- decision, not a migration's business), no notification type change, and no
-- backfill.
--
-- ROLLBACK: supabase/rollbacks/20260819210000_workflow_work_task_context_v1.down.sql
-- (refuses while any definition or instance uses 'work_task', then narrows
-- both CHECKs back to the original ten).
-- ============================================================================

begin;

-- Definitions: an org may now author an approval flow FOR a work task.
alter table public.workflow_definitions
  drop constraint if exists workflow_definitions_context_entity_type_check;

alter table public.workflow_definitions
  add constraint workflow_definitions_context_entity_type_check
  check (context_entity_type in (
    'generic_request','worker_absence','expense','invoice','document_ack',
    'timesheet','procurement','business_trip','management_decision','agreement',
    'work_task'));

-- Instances: a started approval may now point AT a work task.
alter table public.workflow_instances
  drop constraint if exists workflow_instances_context_entity_type_check;

alter table public.workflow_instances
  add constraint workflow_instances_context_entity_type_check
  check (context_entity_type in (
    'generic_request','worker_absence','expense','invoice','document_ack',
    'timesheet','procurement','business_trip','management_decision','agreement',
    'work_task'));

commit;
