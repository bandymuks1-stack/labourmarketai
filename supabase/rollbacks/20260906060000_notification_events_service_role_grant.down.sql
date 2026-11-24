-- ROLLBACK for 20260906060000_notification_events_service_role_grant.sql
-- Restores the exact pre-migration privilege surface: service_role holds no
-- privilege on public.notification_events or public.notification_preferences
-- (the state measured on production 2026-09-06 and re-measured 2026-09-07).
-- Reversible in both directions; no data is touched.

revoke select, insert, update on public.notification_events from service_role;
revoke select on public.notification_preferences from service_role;
