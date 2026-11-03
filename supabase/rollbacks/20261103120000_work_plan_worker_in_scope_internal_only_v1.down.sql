-- Rollback for 20261103120000_work_plan_worker_in_scope_internal_only_v1
-- Restores the grant exactly as 20261007140000 left it (authenticated only)
-- and clears the comment. No data changes.
grant execute on function public.work_plan_worker_in_scope_v1(uuid, uuid) to authenticated;
comment on function public.work_plan_worker_in_scope_v1(uuid, uuid) is null;
