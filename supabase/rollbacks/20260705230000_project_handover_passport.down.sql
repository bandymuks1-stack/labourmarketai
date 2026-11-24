-- ============================================================================
-- DOWN — 20260705230000_project_handover_passport (owner-run manual rollback).
--
-- Restores the pre-wagon state EXACTLY:
--   1. drops ONLY the one NEW function this wagon introduced
--      (add_project_handover_entry_v1);
--   2. drops ONLY the one NEW table (project_handover_entries) — every
--      feature-created row lives ONLY in that table (the gated RPC is the
--      only write path), so dropping it removes ONLY feature-created rows.
--      Nothing outside the new table is touched: no delete on projects,
--      project_worker_assignments, project_worker_readiness_items,
--      booking_requests, or any other existing table.
--
-- ROLLBACK-CHAIN RULE: 20260705230000 recreated NO existing RPC, NO existing
-- trigger and NO existing table (project_handover_entries and
-- add_project_handover_entry_v1 are new names). Therefore this down file must
-- NOT and does NOT contain any `create function` / `create or replace
-- function` — there is no prior body to restore. can_manage_project
-- (20260601091000), is_admin, set_worker_operational_status /
-- upsert_worker_readiness_item (20260609180000) and every other existing RPC
-- remain the repo-latest definitions, untouched in both directions.
-- ============================================================================

begin;

-- 1. Drop ONLY the new function.
drop function if exists public.add_project_handover_entry_v1(text, text, text, text);

-- 2. Drop ONLY the new table (removes only feature-created rows; the select
--    policy and index fall with the table).
drop table if exists public.project_handover_entries;

commit;
