-- ROLLBACK 20261025120000 — business_history_periods_vivatrex_lmai_bounds_v1
-- Removes ONLY the two period rows the up-migration inserted, restoring the
-- prior single null-bound "Vivat Rex" head. Append-only table: these rows are
-- deleted (not superseded) only on rollback, and only while nothing references
-- them. Refuses if another row already supersedes the new Vivat Rex row.
begin;

do $$
begin
  if exists (
    select 1 from public.organization_history_periods c
    join public.organization_history_periods n on c.supersedes_id = n.id
    where n.organization_id = '19f47e78-7bd1-4120-9937-603dba769f8a'
      and lower(btrim(n.period_label)) = 'vivat rex'
      and n.period_start = date '2022-01-17'
      and n.period_end = date '2026-02-22'
  ) then
    raise exception 'the new Vivat Rex period row has been superseded again — resolve the chain before rolling back';
  end if;
end $$;

-- 2. drop the Labour Market AI period (only if nothing supersedes it)
delete from public.organization_history_periods p
where p.organization_id = '19f47e78-7bd1-4120-9937-603dba769f8a'
  and lower(btrim(p.period_label)) = 'labour market ai sp. z o.o'
  and p.period_start = date '2026-02-23'
  and p.supersedes_id is null
  and not exists (select 1 from public.organization_history_periods s where s.supersedes_id = p.id);

-- 1. drop the superseding Vivat Rex row (restores the original null-bound head)
delete from public.organization_history_periods p
where p.organization_id = '19f47e78-7bd1-4120-9937-603dba769f8a'
  and lower(btrim(p.period_label)) = 'vivat rex'
  and p.period_start = date '2022-01-17'
  and p.period_end = date '2026-02-22'
  and p.supersedes_id is not null
  and not exists (select 1 from public.organization_history_periods s where s.supersedes_id = p.id);

commit;
