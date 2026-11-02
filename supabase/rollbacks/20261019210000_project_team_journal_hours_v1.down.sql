-- ROLLBACK for 20261019210000_project_team_journal_hours_v1.sql
-- Removes the hours-only read. Nothing else depended on it in the database;
-- the project page then shows only the hours its own RLS read returns (the
-- state before the fix). No data is touched.

begin;

drop function if exists public.project_team_journal_hour_rows_v1(uuid);

commit;
