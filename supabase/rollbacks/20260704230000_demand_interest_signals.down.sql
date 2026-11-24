-- DOWN / rollback for 20260704230000_demand_interest_signals.sql
--
-- Drops the demand_interest_signals table (policies + indexes go with it).
-- Guarded: refuses if the table holds rows, so real worker interest signals
-- are never silently discarded (§3 — author content history). Apply via
-- Supabase MCP apply_migration, never `db push`.

begin;

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'demand_interest_signals')
     and (select count(*) from public.demand_interest_signals) > 0 then
    raise exception 'demand_interest_signals has rows — refusing to drop (handle the data first)';
  end if;
end $$;

drop table if exists public.demand_interest_signals;

commit;
