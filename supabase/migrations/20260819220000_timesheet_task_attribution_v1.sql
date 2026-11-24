-- ============================================================================
-- RED — human gate SATISFIED. Apply ONLY via Supabase MCP apply_migration.
-- Never `db push` (repo filenames do not match ledger versions; a push would
-- re-run already-applied migrations).
--
-- @human-gate-approved — owner decision 2026-08-20, recorded in full at
-- docs/human-gates/timesheet-task-attribution-v1-gate.md ("SLICE A —
-- APPROVED"). The prior owner decision of 2026-08-19 approved BUILDING this
-- rule and explicitly withheld the apply; the 2026-08-20 decision grants the
-- apply, the merge and the production verification, bound to the exactly-one
-- attribution invariant recorded in that gate file.
--
-- The annotation states the ROUTE (draft + needs-human-gate + owner approval),
-- never an auto-merge or auto-apply pass. Safety class: RED by classification
-- — it replaces the body of an existing SECURITY DEFINER function. ZERO
-- tables, columns, policies, grants, triggers or indexes are created, dropped
-- or modified. ZERO DML at apply time. ONE function body is replaced, with its
-- signature unchanged.
--
-- 20260819220000 — attribute canonical work-time to the task it evidences
-- (field-work operating platform audit v1, chain step A).
--
-- ── WHAT THIS CLOSES ───────────────────────────────────────────────────────
-- 20260818150000 made `journal_entry_metrics` the canonical hours truth and
-- rewired `timesheet_compute_lines_v1` onto it, ending a state where three
-- computations disagreed on a real production entry (0 h / 5 h / 9 h). Each
-- derived line already carries its project, its provenance (`derivedFrom`,
-- `metricSource`, `metricId`) and the worker's own evidence phrase.
--
-- It could not say WHICH TASK the hours were for, because until
-- 20260819190000 there was no link between a journal entry and a work task.
-- That link now exists and is applied. This migration reads it.
--
-- ── THE RULE: EXACTLY ONE, OR NOTHING (never a guess) ──────────────────────
-- A journal entry may carry up to 20 live task links. A naive join would
-- multiply every hours line by the number of linked tasks — precisely the
-- double counting that 20260818150000 was written to make structurally
-- impossible. So:
--
--   * exactly ONE live task link  → the line is attributed to that task;
--   * zero, or two or more        → `taskId` is NULL. The hours still count
--                                   in full, exactly once; they are simply
--                                   not claimed for any one task.
--
-- This is the SAME rule `create_journal_entry_full` already uses to autolink
-- `project_id` ("link ONLY when the match is unambiguous — otherwise NULL,
-- never a guess"), applied to the same kind of ambiguity.
--
-- `taskLinkCount` is emitted alongside so the ambiguity is VISIBLE rather
-- than silent: a reader can see "3 tasks linked, so these hours are not
-- attributed to one of them" instead of wondering why the field is empty.
-- Nothing is hidden and nothing is invented.
--
-- ── TENANT SCOPE (added after review of the first draft) ───────────────────
-- The link table is not a tenant boundary. `link_journal_entry_to_task_v1`
-- asks only that the caller can see the entry and can see the task — never
-- that the two share an organization. Since this function is SECURITY
-- DEFINER, an unscoped title join would let a worker who is the assignee of a
-- task in org B freeze that task's TITLE into org A's timesheet, where org A's
-- managers read it. The `task_link` CTE therefore requires the task to resolve
-- to THIS timesheet's organization through its project or its object spine,
-- with no spine pointing elsewhere. Strictly narrowing: it can only ever
-- DECLINE an attribution, never create one, and it touches no hour.
--
-- ── WHY DOUBLE COUNTING REMAINS STRUCTURALLY IMPOSSIBLE ────────────────────
-- The `task_link` CTE is GROUPED BY entry_id, so it yields AT MOST ONE row
-- per entry. Both new joins in `agg` are therefore 1:1 (`task_link` unique by
-- entry, `work_tasks` unique by primary key) and cannot fan out a line. The
-- rule A / rule B selection, the `limit 500`, the totals and the conflicts
-- array are untouched — this migration adds three OUTPUT fields and changes
-- no arithmetic whatsoever. Hours in = hours out.
--
-- ── WHAT IS DELIBERATELY NOT CHANGED ───────────────────────────────────────
-- The function signature (so the anon/SECDEF allowlist and every existing
-- grant stay exactly as reviewed); the work-day resolution; the tenant scope;
-- the unit handling ('days' still never becomes hours); the conflicts array;
-- `journal_entry_work_items` (still deprecated, still never written); and
-- `apps/web/lib/journal/work-time.ts`, which mirrors the PER-ENTRY rule and
-- is not affected by an aggregation-level attribution field.
--
-- ROLLBACK: supabase/rollbacks/20260819220000_timesheet_task_attribution_v1.down.sql
-- restores the 20260818150000 body verbatim.
-- ============================================================================

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
  -- TASK ATTRIBUTION (chain step A). GROUPED to at most ONE row per entry, so
  -- the join in `agg` can never multiply a line. Exactly one live link wins;
  -- zero or many leave task_id NULL — never a guess.
  --
  -- TENANT SCOPE — cross-organization disclosure defence. This function is
  -- SECURITY DEFINER, so it reads `work_tasks` with RLS bypassed; the link
  -- table alone is NOT a tenant boundary. `link_journal_entry_to_task_v1`
  -- requires the caller to see the entry AND to see the task, but never that
  -- the two share an organization — so a worker who is the assignee of a task
  -- in org B could link their org-A entry to it, and org A's managers would
  -- then read org B's task TITLE frozen into the timesheet snapshot.
  --
  -- `work_tasks` has no organization_id of its own. Its organization is
  -- reached through project → projects.organization_id, or through
  -- object → work_objects.organization_id (NOT NULL there). So:
  --   * at least one spine must resolve to THIS timesheet's organization, and
  --   * no spine may resolve to a DIFFERENT one.
  -- A task with both spines NULL belongs to no organization and can never be
  -- claimed on an organization's timesheet.
  --
  -- The predicate lives in the CTE rather than the title join on purpose: it
  -- filters BEFORE the count, so a link into another organization neither
  -- attributes nor suppresses attribution here — org A's reader learns
  -- nothing at all about the worker's tasks elsewhere, not even that they
  -- exist.
  task_link as (
    select jet.entry_id,
           count(*)::int as link_count,
           case when count(*) = 1 then min(jet.task_id::text)::uuid end as task_id
      from public.journal_entry_tasks jet
      join public.work_tasks wt          on wt.id = jet.task_id
      left join public.projects pr       on pr.id = wt.project_id
      left join public.work_objects wo   on wo.id = wt.object_id
     where jet.entry_id in (select id from period)
       and jet.unlinked_at is null
       and (pr.organization_id = p_organization_id
            or wo.organization_id = p_organization_id)
       and coalesce(pr.organization_id, p_organization_id) = p_organization_id
       and coalesce(wo.organization_id, p_organization_id) = p_organization_id
     group by jet.entry_id
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
             'projectTitle',   p.title,
             -- Chain step A: attributed ONLY when unambiguous. link_count is
             -- emitted so ambiguity is visible, never silent.
             'taskId',         tl.task_id,
             'taskTitle',      wt.title,
             'taskLinkCount',  coalesce(tl.link_count, 0)
           ) order by c.work_day, c.entry_id, c.frag_index nulls first), '[]'::jsonb) as arr,
           count(*)                        as line_count,
           coalesce(sum(c.hours), 0)       as total_hours,
           coalesce(sum(c.day_units), 0)   as total_day_units
      from capped c
      left join public.projects p on p.id = c.project_id
      -- Both 1:1 by construction: task_link is grouped by entry_id, work_tasks
      -- is keyed by its primary key. Neither can fan a line out.
      left join task_link tl on tl.entry_id = c.entry_id
      left join public.work_tasks wt on wt.id = tl.task_id
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

-- The privileges of a `create or replace`d function are preserved, so the
-- REVOKEs written by 20260817170000 and re-asserted by 20260818150000 still
-- stand. Re-asserted here for the same reason they were there: a reader must
-- not have to prove absence to know this function is not callable directly.
revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from public;
revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from anon;
revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from authenticated;

commit;
