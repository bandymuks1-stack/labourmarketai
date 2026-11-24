-- DOWN / rollback for 20260612220000_demand_shortlist.sql
--
-- Drops the demand_shortlist table (policies + indexes go with it). Guarded:
-- refuses if the table holds rows, so real scouting decisions are never
-- silently discarded (§3 — author content history). Apply via Supabase MCP
-- apply_migration, never `db push`.

begin;

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'demand_shortlist')
     and (select count(*) from public.demand_shortlist) > 0 then
    raise exception 'demand_shortlist has rows — refusing to drop (handle the data first)';
  end if;
end $$;

drop table if exists public.demand_shortlist;

commit;
