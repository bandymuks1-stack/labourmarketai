-- Rollback for 20260714150000_ai_runs_audit_v1.sql — restores the prior state
-- exactly. The feature created ONE new table (ai_runs) and its policies /
-- indexes; audit rows live only in that table, so dropping it removes every
-- feature-created object. No existing RPC/trigger/table was recreated.
begin;

drop policy if exists ai_runs_select on public.ai_runs;
drop index if exists ai_runs_task_type_idx;
drop index if exists ai_runs_created_at_idx;
drop table if exists public.ai_runs;

commit;
