-- Rollback for 20260702150000_pilot_events_anon_insert_grant.sql
-- Re-closes the anon INSERT path (login_started from logged-out visitors
-- will silently stop landing again — the pre-0020-fix state).

revoke insert on public.pilot_events from anon;
