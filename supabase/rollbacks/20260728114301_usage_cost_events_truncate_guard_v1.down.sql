-- ============================================================================
-- RECONSTRUCTED AFTER PRODUCTION APPLY — NOT PART OF THE ORIGINAL HISTORY.
--
-- The production ledger row 20260728114301 (usage_cost_events_truncate_guard_v1)
-- stored NO rollback statements. This file was written on 2026-08-03, during
-- the history-parity reconciliation, to satisfy the repo's paired-rollback
-- rule and to support LOCAL development resets. For any production incident
-- the documented path is forward-fix, not this file.
--
-- Removes ONLY the TRUNCATE guard. The ledger, its rows and the row-level
-- append-only trigger are untouched — this reopens TRUNCATE for the table
-- owner, which is exactly the state before that migration.
-- ============================================================================

begin;

drop trigger if exists usage_cost_events_no_truncate on public.usage_cost_events;
drop function if exists public.usage_cost_events_forbid_truncate();

commit;
