-- ROLLBACK for 20260819220000_timesheet_task_attribution_v1.sql
--
-- Restores the timesheet_compute_lines_v1 body EXACTLY as shipped by
-- 20260818150000_journal_canonical_work_time_v1 — the three attribution
-- output fields ('taskId', 'taskTitle', 'taskLinkCount') and the task_link
-- CTE simply disappear. Extracted verbatim from that migration, not retyped.
--
-- Safe to run at any time and needs no refusal guard: this touches ONE
-- function body and no data. Nothing is stored by the forward migration, so
-- there is nothing a rollback could destroy. Timesheet snapshots already
-- frozen in `timesheets.lines_snapshot` keep whatever fields they were
-- computed with — a rollback does not rewrite history, and must not.
--
-- The signature is unchanged in both directions, so the anon/SECDEF
-- allowlist and every existing grant stay exactly as reviewed.

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
  with live as (
    select je.id,
           je.created_at,
           je.project_id,
           je.original_text,
           coalesce(wd.value_text::date, (je.created_at at time zone 'utc')::date) as work_day
      from public.journal_entries je
      join public.engagement_contexts ec on ec.id = je.engagement_context_id
      left join lateral (
        select m.value_text
          from public.journal_entry_metrics m
         where m.entry_id = je.id
           and m.metric_slug = 'work_date'
           and m.value_text ~ '^\d{4}-\d{2}-\d{2}$'
         order by m.created_at desc, m.id desc
         limit 1
      ) wd on true
     where je.worker_id = p_worker_id
       -- TENANT SCOPE: the organization behind the entry's OWN engagement
       -- context. Work logged for org A can never appear on org B's sheet.
       and ec.organization_id = p_organization_id
       and je.deleted_at is null
       and je.superseded_by is null
       and not exists (
         select 1
           from public.journal_entries c
          where c.correction_of = je.id
            and c.deleted_at is null
            and c.superseded_by is null
       )
  ),
  period as (
    select * from live where work_day >= p_start and work_day <= p_end
  ),
  -- RULE A — per-activity durations. First row per (entry, index) wins, so a
  -- duplicated metric row can never be counted twice.
  frag as (
    select distinct on (m.entry_id, m.value_text::int)
           m.entry_id,
           m.value_text::int as frag_index,
           m.value_numeric   as value,
           m.unit_slug       as unit,
           m.source          as metric_source,
           m.id              as metric_id
      from public.journal_entry_metrics m
      join public.productivity_units u
        on u.slug = m.unit_slug and u.category = 'time'
     where m.entry_id in (select id from period)
       and m.metric_slug = 'fragment_time'
       and m.value_numeric is not null
       and m.value_numeric > 0
       and m.value_text ~ '^[1-9][0-9]*$'
     order by m.entry_id, m.value_text::int, m.created_at, m.id
  ),
  -- RULE B — the entry-level duration. Latest row wins.
  qty as (
    select distinct on (m.entry_id)
           m.entry_id,
           m.value_numeric as value,
           m.unit_slug     as unit,
           m.source        as metric_source,
           m.id            as metric_id
      from public.journal_entry_metrics m
      join public.productivity_units u
        on u.slug = m.unit_slug and u.category = 'time'
     where m.entry_id in (select id from period)
       and m.metric_slug = 'quantity'
       and m.value_numeric is not null
       and m.value_numeric > 0
     order by m.entry_id, m.created_at desc, m.id desc
  ),
  -- The worker's own evidence phrase + activity label for each index.
  indexed_text as (
    select distinct on (m.entry_id, m.metric_slug, split_part(m.value_text, '|', 1)::int)
           m.entry_id,
           m.metric_slug,
           split_part(m.value_text, '|', 1)::int as frag_index,
           nullif(btrim(substr(m.value_text, strpos(m.value_text, '|') + 1)), '') as rest
      from public.journal_entry_metrics m
     where m.entry_id in (select id from period)
       and m.metric_slug in ('parsed_fragment', 'fragment_activity')
       and m.value_text ~ '^[1-9][0-9]*\|'
     order by m.entry_id, m.metric_slug, split_part(m.value_text, '|', 1)::int,
              m.created_at, m.id
  ),
  raw_lines as (
    select e.id as entry_id, e.work_day, e.project_id, e.original_text,
           f.frag_index, f.value, f.unit, f.metric_source, f.metric_id,
           'fragment_time'::text as derived_from,
           ev.rest as evidence_phrase,
           ac.rest as work_type_key
      from period e
      join frag f on f.entry_id = e.id
      left join indexed_text ev
        on ev.entry_id = e.id and ev.frag_index = f.frag_index
       and ev.metric_slug = 'parsed_fragment'
      left join indexed_text ac
        on ac.entry_id = e.id and ac.frag_index = f.frag_index
       and ac.metric_slug = 'fragment_activity'
    union all
    -- RULE B applies ONLY when rule A produced nothing for that entry. This
    -- `not exists` is what makes double counting structurally impossible.
    select e.id, e.work_day, e.project_id, e.original_text,
           null::int, q.value, q.unit, q.metric_source, q.metric_id,
           'entry_quantity'::text, null::text, null::text
      from period e
      join qty q on q.entry_id = e.id
     where not exists (select 1 from frag f where f.entry_id = e.id)
  ),
  shaped as (
    select r.entry_id, r.work_day, r.project_id, r.frag_index, r.value, r.unit,
           r.metric_source, r.metric_id, r.derived_from, r.evidence_phrase,
           r.work_type_key,
           case
             when r.frag_index is null then r.entry_id::text || '#entry'
             else r.entry_id::text || '#f' || r.frag_index::text
           end as line_key,
           -- hours + minutes/60; 'days' totalled separately, never multiplied.
           case r.unit
             when 'hours'   then round(r.value, 2)
             when 'minutes' then round(r.value / 60.0, 2)
             else 0
           end as hours,
           case when r.unit = 'days' then r.value else 0 end as day_units,
           -- Title: the worker's evidence, else the activity label, else the
           -- entry's own first line. Never invented text.
           coalesce(
             r.evidence_phrase,
             r.work_type_key,
             nullif(btrim(split_part(replace(coalesce(r.original_text, ''), chr(13), ''), chr(10), 1)), ''),
             ''
           ) as title_raw
      from raw_lines r
  ),
  capped as (
    select s.*,
           case when length(s.title_raw) > 120
                then left(s.title_raw, 119) || chr(8230)
                else s.title_raw end as title
      from shaped s
     order by s.work_day, s.entry_id, s.frag_index nulls first
     limit 500
  ),
  agg as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'lineKey',        c.line_key,
             'journalEntryId', c.entry_id,
             'fragmentIndex',  c.frag_index,
             'day',            to_char(c.work_day, 'YYYY-MM-DD'),
             'title',          c.title,
             'evidencePhrase', c.evidence_phrase,
             'workTypeKey',    c.work_type_key,
             'value',          c.value,
             'unit',           c.unit,
             'hours',          c.hours,
             'dayUnits',       c.day_units,
             'derivedFrom',    c.derived_from,
             'metricSource',   c.metric_source,
             'metricId',       c.metric_id,
             'projectId',      c.project_id,
             'projectTitle',   p.title
           ) order by c.work_day, c.entry_id, c.frag_index nulls first), '[]'::jsonb) as arr,
           count(*)                        as line_count,
           coalesce(sum(c.hours), 0)       as total_hours,
           coalesce(sum(c.day_units), 0)   as total_day_units
      from capped c
      left join public.projects p on p.id = c.project_id
  ),
  conf as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'journalEntryId', e.id,
             'reason',         'entry_quantity_ignored_fragments_present',
             'value',          q.value,
             'unit',           q.unit
           ) order by e.id), '[]'::jsonb) as arr
      from period e
      join qty q on q.entry_id = e.id
     where exists (select 1 from frag f where f.entry_id = e.id)
  )
  select jsonb_build_object(
    'computedAt',  to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'periodStart', to_char(p_start, 'YYYY-MM-DD'),
    'periodEnd',   to_char(p_end, 'YYYY-MM-DD'),
    'source',      'journal_entry_metrics',
    'lines',       agg.arr,
    'conflicts',   conf.arr,
    'totals',      jsonb_build_object(
                     'totalHours',    round(agg.total_hours, 2),
                     'totalDayUnits', round(agg.total_day_units, 2),
                     'lineCount',     agg.line_count)
  )
  from agg, conf
$$;

-- Privileges survive a `create or replace`; re-asserted for the same reason
-- the forward migration re-asserts them.
revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from public;
revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from anon;
revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from authenticated;

commit;
