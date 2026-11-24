-- DOWN / rollback for 20260705120000_demand_interest_company_ack.sql
--
-- Drops the acknowledgement RPC only. No table, no data, no policy is
-- touched — acknowledged rows keep their status (honest history; the worker
-- still controls their own row). Apply via Supabase MCP apply_migration,
-- never `db push`.

begin;

drop function if exists public.acknowledge_demand_interest(uuid, uuid, text);

commit;
