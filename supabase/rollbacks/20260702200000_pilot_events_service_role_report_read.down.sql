-- Rollback for 20260702200000_pilot_events_service_role_report_read.sql
-- Restores the exact prior state: ZERO service_role privileges on all three
-- objects (verified pre-apply 2026-07-02 via has_table_privilege). The local
-- activation report CLI then fails loudly with "permission denied" again.

revoke select on public.pilot_events from service_role;
revoke select (id, active_role) on public.profiles from service_role;
revoke select (profile_id, role) on public.profile_roles from service_role;
