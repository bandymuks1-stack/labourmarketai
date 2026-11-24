-- ============================================================================
-- RECONSTRUCTED AFTER PRODUCTION APPLY — NOT PART OF THE ORIGINAL HISTORY.
--
-- The production ledger row 20260728114008 (usage_cost_events_v1) stored NO
-- rollback statements. This file was written on 2026-08-03, during the
-- history-parity reconciliation, to satisfy the repo's paired-rollback rule
-- and to support LOCAL development resets. For any production incident the
-- documented path is forward-fix, not this file.
--
-- FAIL-CLOSED: refuses to run while any event exists. A usage/cost ledger is
-- an accounting record; dropping a populated one is an owner decision.
-- ============================================================================

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
