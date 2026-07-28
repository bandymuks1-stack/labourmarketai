-- ============================================================================
-- ROLLBACK for 20260728140000_usage_cost_events_truncate_guard_v1.sql
--
-- Removes ONLY the TRUNCATE guard. The ledger, its rows and the row-level
-- append-only trigger are untouched — this reopens TRUNCATE for the table
-- owner, which is exactly the state before that migration.
-- ============================================================================

-- @human-gate-approved
begin;

drop trigger if exists usage_cost_events_no_truncate on public.usage_cost_events;
drop function if exists public.usage_cost_events_forbid_truncate();

commit;
