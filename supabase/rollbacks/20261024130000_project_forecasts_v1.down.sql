-- Rollback of 20261024130000_project_forecasts_v1.
-- The four tables hold FORECAST history and scheduler bookkeeping only — no
-- fact lives here, and nothing outside the forecast code references them.
-- Stop the cron line (lm-cron.sh forecast-recompute) first; the route answers
-- 503 "unavailable" while the functions are absent, which is harmless.
begin;

drop trigger if exists forecast_signal on public.journal_entries;
drop trigger if exists forecast_signal on public.work_hour_allocations;
drop trigger if exists forecast_signal on public.work_tasks;
drop trigger if exists forecast_signal on public.project_stages;
drop trigger if exists forecast_signal on public.projects;
drop trigger if exists forecast_signal on public.project_worker_assignments;
drop trigger if exists forecast_signal on public.team_assignments;
drop trigger if exists forecast_signal on public.worker_absences;
drop trigger if exists forecast_signal on public.work_plan_entries;
drop trigger if exists forecast_signal on public.defects;
drop trigger if exists forecast_signal on public.defect_corrections;
drop trigger if exists forecast_signal on public.task_dependencies;
drop trigger if exists forecast_signal on public.procurement_inquiries;
drop trigger if exists forecast_signal on public.project_budgets;
drop trigger if exists forecast_signal on public.finance_records;

drop function if exists public.forecast_set_mode_v1(uuid, text, boolean, text);
drop function if exists public.forecast_record_v1(uuid, text, text, timestamptz, date, text, text, jsonb, jsonb, jsonb, boolean, bigint);
drop function if exists public.forecast_project_facts_v1(uuid, date);
drop function if exists public.forecast_due_candidates_v1(integer);
drop function if exists public.forecast_note_signal_trg();

drop table if exists public.project_forecast_signals;
drop table if exists public.project_forecast_state;
drop table if exists public.project_forecasts;
drop table if exists public.organization_forecast_settings;

commit;
