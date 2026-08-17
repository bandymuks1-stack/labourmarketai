-- ROLLBACK for 20260817151000_work_tasks_v2_collaboration.sql
-- Drops ONLY what the up migration created: six NEW RPCs, the history
-- trigger + its function, the two NEW tables and the ONE new column.
-- The three v1 work-task RPCs were never touched by the up migration, so
-- nothing is restored verbatim.
--
-- REFUSES while real dependency edges or history rows exist: history is an
-- append-only record of things that really happened and deleting it would
-- falsify the trail. After real use the correct move is a FORWARD FIX.

begin;

do $$
declare
  n_events bigint;
  n_deps   bigint;
begin
  select count(*) into n_events from public.work_task_events;
  select count(*) into n_deps   from public.task_dependencies;
  if n_events > 0 or n_deps > 0 then
    raise exception
      'work_tasks v2 rollback refused: % history row(s) and % dependency edge(s) exist — forward-fix instead',
      n_events, n_deps;
  end if;
end $$;

drop function if exists public.remove_work_task_dependency_v1(text, text);
drop function if exists public.add_work_task_dependency_v1(text, text);
drop function if exists public.reopen_work_task_v1(text);
drop function if exists public.set_work_task_status_v2(text, text);
drop function if exists public.update_work_task_v2(text, text, text, text, text, text);
drop function if exists public.assign_work_task_v1(text, text);
drop function if exists public.create_work_task_v2(text, text, text, text, text, text, text);
drop function if exists public.work_task_assignee_eligible_v1(uuid, uuid);

drop trigger if exists trg_work_tasks_history on public.work_tasks;
drop function if exists public.log_work_task_event();

drop table if exists public.task_dependencies;
drop table if exists public.work_task_events;

-- The object pointer: assert no task still points at an object before the
-- column is removed (a populated link is real data).
do $$
declare
  n bigint;
begin
  select count(*) into n from public.work_tasks where object_id is not null;
  if n > 0 then
    raise exception
      'work_tasks.object_id rollback refused: % task(s) still link an object — forward-fix instead',
      n;
  end if;
end $$;

drop index if exists public.wt_object_idx;
alter table public.work_tasks drop column if exists object_id;

commit;
