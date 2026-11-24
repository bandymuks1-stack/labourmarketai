-- DOWN / rollback for 20260614120000_worker_demand_visibility.sql
--
-- Drops the read-only worker demand-visibility function. Fully reversible:
-- it is a new function only — no table, column, policy, grant-on-table or data
-- change to undo. Apply via Supabase MCP apply_migration, never `db push`.

begin;

drop function if exists public.list_open_demand_for_workers();

commit;
