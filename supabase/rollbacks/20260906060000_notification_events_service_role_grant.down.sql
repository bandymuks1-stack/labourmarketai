-- ROLLBACK for 20260906060000_notification_events_service_role_grant.sql
-- Restores the exact pre-migration privilege surface: service_role holds no
-- privilege on public.notification_events (the state measured on production
-- 2026-09-06). Reversible in both directions; no data is touched.

revoke select, insert, update on public.notification_events from service_role;
