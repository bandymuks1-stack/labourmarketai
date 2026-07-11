-- Rollback for 20260711310000_worker_saved_opportunities_v1.sql — drops ONLY
-- the objects that migration created (two functions + the table). Apply
-- manually via Supabase MCP after owner approval, never `db push`.

begin;

drop function if exists public.save_worker_opportunity_v1(uuid, text);
drop function if exists public.unsave_worker_opportunity_v1(uuid);
drop table if exists public.worker_saved_opportunities;

commit;
