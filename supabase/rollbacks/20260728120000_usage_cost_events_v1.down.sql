-- ============================================================================
-- ROLLBACK for 20260728120000_usage_cost_events_v1.sql
--
-- FAIL-CLOSED: refuses to run while any event exists. A usage/cost ledger is
-- an accounting record; dropping a populated one is an owner decision with a
-- data-preservation review first (CLAUDE.md destructive-migration gate), not a
-- rollback step.
--
-- Safe to run immediately after the up-migration (0 rows) — that is exactly
-- the rollback→re-apply proof.
-- ============================================================================

-- @human-gate-approved
begin;

do $$
declare
  v_rows bigint;
begin
  if to_regclass('public.usage_cost_events') is null then
    raise notice 'usage_cost_events does not exist — nothing to roll back';
    return;
  end if;
  select count(*) into v_rows from public.usage_cost_events;
  if v_rows > 0 then
    raise exception
      'refusing to drop usage_cost_events: % committed event(s) present. Preserve or export the ledger first.',
      v_rows
      using errcode = '42501';
  end if;
end;
$$;

drop trigger if exists usage_cost_events_no_mutation on public.usage_cost_events;
drop function if exists public.usage_cost_events_forbid_mutation();
drop table if exists public.usage_cost_events;

commit;
