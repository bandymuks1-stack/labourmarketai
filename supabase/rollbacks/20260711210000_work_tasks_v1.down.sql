-- Rollback for 20260711210000_work_tasks_v1.sql
--
-- Restores the prior state exactly: the up-migration created ONE new table
-- and THREE new functions and touched nothing else (no existing table,
-- policy, grant, trigger or RPC was modified or recreated). Dropping them
-- removes only feature-created rows (all task rows live exclusively in
-- public.work_tasks). The consuming app on main degrades honestly the
-- moment the table is gone (42P01 → "preparing" state, spine count 0).

begin;

drop function if exists public.update_work_task_v1(text, text, text, text, text);
drop function if exists public.set_work_task_status_v1(text, text);
drop function if exists public.create_work_task_v1(text, text, text, text, text, boolean);

drop table if exists public.work_tasks;

commit;
