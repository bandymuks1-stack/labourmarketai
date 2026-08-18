-- Rollback for 20260818150000_journal_canonical_work_time_v1.sql
--
-- Restores the ORIGINAL 20260817170000 body of
-- `timesheet_compute_lines_v1` — the one that derives from
-- `journal_entry_work_items` — and clears the deprecation comment.
--
-- WHAT THIS COSTS, STATED PLAINLY: `journal_entry_work_items` has zero rows
-- and no writer, so rolling back returns every timesheet to producing zero
-- lines. Only roll back if the canonical derivation is itself found unsafe.
--
-- No data is touched by either direction: this file replaces one function
-- body and resets two COMMENTs. Nothing is inserted, updated or deleted.

begin;

create or replace function public.timesheet_compute_lines_v1(
  p_worker_id       uuid,
  p_organization_id uuid,
  p_start           date,
  p_end             date
) returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select wi.id,
           wi.journal_entry_id,
           wi.title,
           wi.work_type_key,
           wi.hours_numeric,
           coalesce(wi.unit, 'hours') as unit,
           wi.status,
           je.project_id,
           case
             when wd.value_text ~ '^\d{4}-\d{2}-\d{2}$' then wd.value_text::date
             else (je.created_at at time zone 'utc')::date
           end as work_day
      from public.journal_entry_work_items wi
      join public.journal_entries je on je.id = wi.journal_entry_id
      left join lateral (
        select m.value_text
          from public.journal_entry_metrics m
         where m.entry_id = je.id and m.metric_slug = 'work_date'
         order by m.created_at desc
         limit 1
      ) wd on true
     where wi.worker_id = p_worker_id
       and wi.organization_id = p_organization_id
       and wi.hours_numeric is not null
       and wi.status <> 'rejected'
       and je.deleted_at is null
       and je.superseded_by is null
       and not exists (
         select 1 from public.journal_entries c
          where c.correction_of = je.id
            and c.deleted_at is null
            and c.superseded_by is null
       )
  ),
  period as (
    select b.*, p.title as project_title
      from base b
      left join public.projects p on p.id = b.project_id
     where b.work_day >= p_start and b.work_day <= p_end
     order by b.work_day, b.id
     limit 500
  ),
  lines as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'workItemId',     id,
             'journalEntryId', journal_entry_id,
             'day',            to_char(work_day, 'YYYY-MM-DD'),
             'title',          title,
             'workTypeKey',    work_type_key,
             'value',          hours_numeric,
             'unit',           unit,
             'itemStatus',     status,
             'projectId',      project_id,
             'projectTitle',   project_title
           ) order by work_day, id), '[]'::jsonb) as arr,
           count(*) as line_count,
           coalesce(sum(case
             when unit = 'hours'   then hours_numeric
             when unit = 'minutes' then round(hours_numeric / 60.0, 2)
             else 0 end), 0) as total_hours,
           coalesce(sum(case when unit = 'days' then hours_numeric else 0 end), 0)
             as total_day_units
      from period
  )
  select jsonb_build_object(
    'computedAt',  to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'periodStart', to_char(p_start, 'YYYY-MM-DD'),
    'periodEnd',   to_char(p_end, 'YYYY-MM-DD'),
    'lines',       arr,
    'totals',      jsonb_build_object(
                     'totalHours',    total_hours,
                     'totalDayUnits', total_day_units,
                     'lineCount',     line_count)
  ) from lines
$$;

comment on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) is null;
comment on table public.journal_entry_work_items is null;

commit;
