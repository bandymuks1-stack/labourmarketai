-- ============================================================================
-- ROLLBACK for 20260808130000_ai_runs_retention_redaction_v1.sql
--
-- Drops the retention capability. No grant on public.ai_runs was added by the
-- forward migration, so there is nothing to restore there — the table was and
-- remains append-only for every role.
--
-- HONEST LIMIT: rows already redacted stay redacted. A rollback cannot
-- resurrect content that was deliberately destroyed, and claiming otherwise
-- would be the dishonest part of an "undo".
-- ============================================================================

begin;

drop function if exists public.redact_expired_ai_run_content(integer);
drop function if exists public.ai_runs_retention_days();

commit;
