-- ============================================================================
-- ROLLBACK for 20260817170000_timesheets_v1.sql
--
-- Restores the prior state exactly: drops ONLY the 2 triggers, 7 functions
-- and 2 tables that migration created. No pre-existing object was touched by
-- the up migration, so nothing is recreated here. Feature-created rows live
-- ONLY in the dropped tables.
--
-- Apply manually via Supabase MCP after owner approval — never `db push`.
-- ============================================================================

begin;

drop trigger if exists timesheet_events_append_only on public.timesheet_events;
drop trigger if exists timesheets_frozen on public.timesheets;

-- Tables first: the timesheet_events SELECT policy depends on
-- timesheet_can_view_v1, so the policies must fall with their tables before
-- the helper functions can be dropped.
drop table if exists public.timesheet_events;
drop table if exists public.timesheets;

drop function if exists public.sync_timesheet_decision_v1(text);
drop function if exists public.reopen_timesheet_v1(text, text);
drop function if exists public.submit_timesheet_v1(text);
drop function if exists public.refresh_timesheet_lines_v1(text);
drop function if exists public.create_timesheet_v1(text, text, text);
drop function if exists public.timesheet_compute_lines_v1(uuid, uuid, date, date);
drop function if exists public.timesheet_can_view_v1(uuid);
drop function if exists public.timesheet_events_guard();
drop function if exists public.timesheets_frozen_guard();

commit;
