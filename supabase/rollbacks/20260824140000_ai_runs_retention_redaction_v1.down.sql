-- Rollback for 20260824140000_ai_runs_retention_redaction_v1.sql
--
-- Drops the retention redaction function. No data is restored — redaction is
-- irreversible by design (the whole point is that the sensitive columns are
-- gone), but at apply time `ai_runs` is empty so no row has been redacted, and
-- the function existing has no effect until it is invoked. This rollback
-- carries no approval marker of its own: undoing an unapplied gate needs no
-- approval.

drop function if exists public.ai_runs_apply_retention(interval);
