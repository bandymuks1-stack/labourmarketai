-- ============================================================================
-- ROLLBACK for 20260902200000_work_plan_entries_v1
--
-- Removes the plan primitive. Guarded: refuses while planned windows exist,
-- because a rollback must not silently destroy what managers planned. Cancel
-- or export them first, then re-run.
-- ============================================================================

do $$
declare v_rows bigint;
begin
  if to_regclass('public.work_plan_entries') is not null then
    select count(*) into v_rows from public.work_plan_entries where status = 'planned';
    if v_rows > 0 then
      raise exception 'work_plan_entries rollback refused: % planned windows exist — cancel or export them first', v_rows;
    end if;
  end if;
end;
$$;

drop function if exists public.cancel_work_plan_entry_v1(uuid);
drop function if exists public.create_work_plan_entry_v1(uuid, uuid, date, date, uuid, uuid, time, time, text);
drop function if exists public.work_plan_worker_in_scope_v1(uuid, uuid);
drop trigger if exists trg_work_plan_entries_updated_at on public.work_plan_entries;
drop table if exists public.work_plan_entries;
drop function if exists public.work_plan_entries_touch_updated_at();
