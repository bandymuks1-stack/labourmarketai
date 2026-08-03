-- ============================================================================
-- MIGRATION ALREADY APPLIED IN PRODUCTION — NEVER MANUALLY RE-APPLY.
--
-- Production ledger version : 20260728114301
-- Production ledger name    : usage_cost_events_truncate_guard_v1
-- Applied to production     : 2026-07-28 11:43:01 UTC, via Supabase MCP apply_migration
--                             (project gorgitwvdzxbnaxhrsrw), BEFORE this file
--                             existed in the repository.
-- Restored to repo          : 2026-08-03, for migration-history parity only
--                             (Option A of docs/audits/
--                             usage-cost-migration-drift-inventory-2026-08-03.md;
--                             reconciliation PR: fix/reconcile-usage-cost-
--                             production-migration-history).
-- Parity proof              : everything below the marker line is BYTE-EXACT to
--                             production's stored statements. md5 = 6da7b0d1dceec7d5ac9f5c0f31ce7322.
--                             Verify: strip the banner up to and including the
--                             marker line, then md5sum the remainder.
-- ROLLBACK                  : supabase/rollbacks/20260728114301_usage_cost_events_truncate_guard_v1.down.sql —
--                             RECONSTRUCTED after the production apply. The
--                             production ledger stored NO rollback for this
--                             migration; the documented incident path is
--                             forward-fix. The down file exists for local
--                             development resets and repo governance only and
--                             is NOT part of the original production history.
-- Do NOT edit below the marker. Do NOT apply to production — it is already there.
-- ============================================================================
-- @human-gate-approved
-- HUMAN GATE SCOPE (owner approval 2026-08-03, PR #995 ONLY): the owner
-- approved exactly the 12 migration-safety findings across these four files
-- (grant-or-revoke x3, create-trigger x4, truncate-token x3,
-- alter-drop-policy x1, drop-without-zero-row-guard x1) AS THE RESTORATION OF
-- HISTORICAL, ALREADY-PRODUCTION-APPLIED SQL. This SQL was applied to
-- production on 2026-07-28, BEFORE this PR existed; the PR only restores the
-- production history to the repository. This approval grants NO right to
-- apply any migration to production, approves NO production data mutation,
-- and the reconstructed rollback files are NOT part of the original
-- production history. Findings stay visible as human-gated notices.
-- PRODUCTION-EXACT-SQL-BELOW
-- Append-only hardening found by the production proof run: a row-level
-- BEFORE UPDATE OR DELETE trigger does NOT fire on TRUNCATE, so the table
-- owner could still empty the ledger in one statement. A STATEMENT-level
-- BEFORE TRUNCATE trigger closes that last path.
create or replace function public.usage_cost_events_forbid_truncate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'usage_cost_events is append-only: TRUNCATE is not permitted'
    using errcode = '42501';
end;
$$;

drop trigger if exists usage_cost_events_no_truncate on public.usage_cost_events;
create trigger usage_cost_events_no_truncate
  before truncate on public.usage_cost_events
  for each statement execute function public.usage_cost_events_forbid_truncate();