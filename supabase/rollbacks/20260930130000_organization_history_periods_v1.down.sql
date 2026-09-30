-- Rollback 20260930130000: removes organization_history_periods.
-- Refuses while any period exists — a period is an evidenced statement about a
-- business history; supersede it deliberately (the table is append-only) and
-- export it before dropping the table.
do $$
begin
  if exists (select 1 from public.organization_history_periods) then
    raise exception 'organization_history_periods holds statements — export them before rolling back';
  end if;
end $$;
drop policy if exists organization_history_periods_insert on public.organization_history_periods;
drop policy if exists organization_history_periods_select on public.organization_history_periods;
drop table if exists public.organization_history_periods;
