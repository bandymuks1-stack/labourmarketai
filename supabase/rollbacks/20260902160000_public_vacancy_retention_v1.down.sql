-- ============================================================================
-- ROLLBACK for 20260902160000_public_vacancy_retention_v1
--
-- Removes the retention function. If a NON-dry run was executed before this
-- rollback, stage 1 (deactivation) is reversed by the statement below with
-- the SAME grace that was used; stage 2 (description_raw := null) cannot be
-- reversed — the source stream does not re-serve expired ads — which is why
-- it is a separate opt-in flag behind the owner gate.
-- ============================================================================

drop function if exists public.public_vacancy_retention_run_v1(interval, boolean, boolean);

-- Stage-1 reversal (run ONLY if the forward function was executed with
-- p_dry_run := false; replace the interval with the grace that was used):
-- update public.public_vacancies
--    set is_active = true, updated_at = now()
--  where is_active = false
--    and lifecycle = 'published'
--    and expires_at is not null
--    and expires_at <= now() - interval '30 days';
