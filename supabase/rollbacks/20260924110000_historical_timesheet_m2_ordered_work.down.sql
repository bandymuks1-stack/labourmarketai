-- DOWN for 20260924110000_historical_timesheet_m2_ordered_work
-- Historical timesheet import PR-4 (design §5.3 "Rollback", §14 row M2).
--
-- REFUSES while any ordered-work step exists: a step is a recorded business
-- event (design §5.5) and evidence is never dropped to undo a schema change.
-- When the table holds 0 rows it drops, in reverse order: the two policies,
-- the two indexes and the table. The grants go with the table; nothing else
-- was touched by M2, so nothing else is restored. A missing table is a no-op.
--
-- Apply via Supabase MCP apply_migration, never db push.

begin;

do $hist_m_two_down_guard$
declare
  v_n bigint;
begin
  if to_regclass('public.project_ordered_work') is null then
    raise notice 'project_ordered_work does not exist — nothing to roll back';
    return;
  end if;
  select count(*) into v_n from public.project_ordered_work;
  if v_n > 0 then
    raise exception 'REFUSED: % project_ordered_work row(s) exist — an ordered-work step is a recorded business event and is never dropped', v_n;
  end if;
  drop policy if exists pow_insert on public.project_ordered_work;
  drop policy if exists pow_select on public.project_ordered_work;
  drop index if exists public.pow_project_idx;
  drop index if exists public.pow_one_live_initial;
end $hist_m_two_down_guard$;

drop table if exists public.project_ordered_work;

commit;
