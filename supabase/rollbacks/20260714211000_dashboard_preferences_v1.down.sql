-- Rollback for 20260714211000_dashboard_preferences_v1.sql (run by hand after
-- explicit owner approval; forward migrations never run this).
begin;

drop policy if exists dashboard_preferences_select on public.dashboard_preferences;
drop policy if exists dashboard_preferences_insert on public.dashboard_preferences;
drop policy if exists dashboard_preferences_update on public.dashboard_preferences;
drop policy if exists dashboard_preferences_delete on public.dashboard_preferences;
drop table if exists public.dashboard_preferences;

commit;
