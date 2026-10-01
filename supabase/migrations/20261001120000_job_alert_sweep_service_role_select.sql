-- @human-gate-approved
--
-- SAFETY CLASS: RED (a GRANT is a privilege-surface change, doctrine-guard §4).
-- Draft PR + `needs-human-gate`; applied ONLY via Supabase MCP apply_migration
-- after explicit owner approval. Never `db push`.
--
-- 20261001120000 — the job-alert SWEEP's recipient-discovery reads (stream N).
-- Sibling of 20260908070000 (journal_entries + workers). ADDITIVE; SELECT ONLY;
-- NO data change; NO RLS change; nothing for anon or authenticated.
--
-- WHY: /api/cron/job-alerts reaches registered workers who have not logged in.
-- It reads each worker's declared profession (worker_professions -> professions
-- .slug) beside workers.preferred_countries / salary_min_eur (already granted).
-- service_role holds NO privilege on these two tables today (measured
-- 2026-10-01: role_table_grants lists none), so the sweep answers 42501 and
-- reports `unavailable` honestly. The read-time job-alert path needs no grant.
--
-- BLAST RADIUS: service_role can read declared professions (a work-type label,
-- no contact data). The sweep returns counts only. The key is server-side only.
-- ROLLBACK: supabase/rollbacks/20261001120000_job_alert_sweep_service_role_select.down.sql
-- POST-APPLY: select grantee, table_name, privilege_type
--   from information_schema.role_table_grants
--   where grantee='service_role' and table_name in ('worker_professions','professions');

begin;
grant select on table public.worker_professions to service_role;
grant select on table public.professions to service_role;
commit;
