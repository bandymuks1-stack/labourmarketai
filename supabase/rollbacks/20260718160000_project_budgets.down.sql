-- Rollback for 20260718160000_project_budgets.sql
-- Brand-new objects only; nothing else depends on them. Reversible.

drop function if exists public.delete_project_budget_v1(uuid);
drop function if exists public.set_project_budget_status_v1(uuid, text);
drop function if exists public.set_project_budget_v1(uuid, text, bigint, text);

drop table if exists public.project_budgets cascade;
