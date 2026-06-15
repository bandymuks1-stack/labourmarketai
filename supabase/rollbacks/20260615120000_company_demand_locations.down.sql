-- DOWN / rollback for 20260615120000_company_demand_locations.sql
--
-- Fully reversible: the forward migration only ADDS one new table
-- (public.company_demand_locations) with its indexes, RLS policies and a single
-- grant to `authenticated`. Nothing on customer_requests or any existing object
-- is changed, so the reversal is a clean DROP of the new table — its policies,
-- indexes and grants are owned by the table and disappear with it.
--
-- The table is new (created by the same draft), so it carries no pre-existing
-- production rows to preserve; a 0-row assertion is therefore not required for
-- this reversal. Apply via Supabase MCP apply_migration, never `db push`.

begin;

drop table if exists public.company_demand_locations;

commit;
