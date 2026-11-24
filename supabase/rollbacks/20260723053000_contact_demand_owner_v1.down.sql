-- Rollback for 20260723053000_contact_demand_owner_v1.sql
-- Restores the pre-migration state: no RPC → the app's feature detection
-- returns the honest "needs_migration" reason again.

drop function if exists public.contact_demand_owner_v1(uuid);
