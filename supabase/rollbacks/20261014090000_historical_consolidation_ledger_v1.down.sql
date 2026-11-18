-- ROLLBACK of 20261014090000_historical_consolidation_ledger_v1.sql
--
-- Refuses while any merge recorded in the ledger is still live: dropping the
-- ledger would leave duplicate-marked projects with no recorded reason. Undo
-- the package first (its own rollback), then this.

begin;

do $$
begin
  if to_regclass('public.historical_consolidation_decisions') is not null
     and exists (select 1 from public.historical_consolidation_decisions
                  where decision = 'merged' and reverted_at is null) then
    raise exception 'rollback refused: live merges are recorded in historical_consolidation_decisions — roll back the consolidation package first';
  end if;
end $$;

drop function if exists public.revert_historical_consolidation_v1(uuid, text);
drop table if exists public.historical_consolidation_decisions;

commit;
