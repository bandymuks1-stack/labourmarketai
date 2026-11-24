-- ROLLBACK for 20260819210000_workflow_work_task_context_v1.sql
-- Narrows both context_entity_type CHECKs back to the original ten kinds.
--
-- REFUSES while any definition or instance actually uses 'work_task':
-- narrowing the CHECK under live rows would fail the constraint anyway, and
-- deleting a real approval flow (or a real pending approval on somebody's
-- work) is an owner data decision, never a rollback.
--
-- Nothing else to restore: the forward migration created no table, function,
-- policy, grant or trigger, and ran no DML.

begin;

do $$
declare
  n_def bigint;
  n_ins bigint;
begin
  select count(*) into n_def
    from public.workflow_definitions where context_entity_type = 'work_task';
  select count(*) into n_ins
    from public.workflow_instances where context_entity_type = 'work_task';
  if n_def > 0 or n_ins > 0 then
    raise exception
      'work_task workflow rollback refused: % definition(s) and % instance(s) use it — forward-fix instead',
      n_def, n_ins;
  end if;
end $$;

alter table public.workflow_definitions
  drop constraint if exists workflow_definitions_context_entity_type_check;

alter table public.workflow_definitions
  add constraint workflow_definitions_context_entity_type_check
  check (context_entity_type in (
    'generic_request','worker_absence','expense','invoice','document_ack',
    'timesheet','procurement','business_trip','management_decision','agreement'));

alter table public.workflow_instances
  drop constraint if exists workflow_instances_context_entity_type_check;

alter table public.workflow_instances
  add constraint workflow_instances_context_entity_type_check
  check (context_entity_type in (
    'generic_request','worker_absence','expense','invoice','document_ack',
    'timesheet','procurement','business_trip','management_decision','agreement'));

commit;
