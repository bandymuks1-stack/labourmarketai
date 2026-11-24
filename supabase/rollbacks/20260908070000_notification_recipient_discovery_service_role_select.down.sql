-- ROLLBACK for 20260908070000_notification_recipient_discovery_service_role_select.sql
-- Restores the exact pre-migration privilege surface: service_role holds no
-- privilege on public.journal_entries or public.workers (the state measured on
-- production 2026-09-08 and reproduced under `set local role service_role` as
-- PROBE_RESULT journal_entries=BLOCKED_42501 workers=BLOCKED_42501).
-- Reversible in both directions; no data is touched.
--
-- Reverting this restores the HTTP 503 on /api/cron/weekly-digest: the digest
-- sweep cannot discover a recipient without these two reads.

revoke select on public.journal_entries from service_role;
revoke select on public.workers from service_role;
