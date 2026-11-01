-- ROLLBACK for 20261025045152_project_forecasts_v1.sql
-- RECONSTRUCTED after the production apply; the production ledger stored NO rollback.
-- LOCAL RESETS ONLY. In production the forecast tables hold append-only forecast versions;
-- the incident path there is forward-fix, never this file.
begin;
do $$
declare t text;
begin
  foreach t in array array['journal_entries','work_hour_allocations','work_tasks','project_stages','projects',
    'project_worker_assignments','team_assignments','worker_absences','work_plan_entries','defects',
    'defect_corrections','task_dependencies','procurement_inquiries','project_budgets','finance_records'] loop
    execute format('drop trigger if exists forecast_signal on public.%I', t);
  end loop;
end $$;
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
