-- ============================================================================
-- DOWN — 20260705235000_follow_up_tasks (owner-run manual rollback).
--
-- Restores the pre-wagon state EXACTLY:
--   1. drops ONLY the two NEW functions this wagon introduced
--      (create_follow_up_task_v1, set_follow_up_task_status_v1);
--   2. drops ONLY the one NEW table (follow_up_tasks) — every
--      feature-created row lives ONLY in that table (the gated RPCs are the
--      only write paths), so dropping it removes ONLY feature-created rows.
--      Nothing outside the new table is touched: no delete on profiles,
--      companies, customer_requests, or any other existing table.
--
-- ROLLBACK-CHAIN RULE: 20260705235000 recreated NO existing RPC, NO existing
-- trigger and NO existing table (follow_up_tasks, create_follow_up_task_v1
-- and set_follow_up_task_status_v1 are new names). Therefore this down file
-- must NOT and does NOT contain any `create function` / `create or replace
-- function` — there is no prior body to restore. is_admin (0024 dual-signal),
-- add_project_handover_entry_v1 (20260705230000) and every other existing
-- RPC remain the repo-latest definitions, untouched in both directions.
-- ============================================================================

begin;

-- 1. Drop ONLY the new functions.
drop function if exists public.create_follow_up_task_v1(text, text, text);
drop function if exists public.set_follow_up_task_status_v1(text, text);

-- 2. Drop ONLY the new table (removes only feature-created rows; the select
--    policy and index fall with the table).
drop table if exists public.follow_up_tasks;

commit;
