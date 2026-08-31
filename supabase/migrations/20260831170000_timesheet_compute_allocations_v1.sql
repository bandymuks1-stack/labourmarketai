-- ============================================================================
-- RED — human gate route. Apply ONLY via Supabase MCP apply_migration.
-- Never `db push` (repo filenames do not match ledger versions; a push would
-- re-run already-applied migrations).
--
-- @human-gate-approved — owner 2026-08-31 closure-session approval sequence
-- ("wire the actual timesheet compute path"), scope: the fresh #1344 /
-- decision package docs/DECISIONS/0010 sequence. The repo records that
-- sequence verbatim in two places:
--   * docs/DECISIONS/0010-owner-migration-decision-package-2026-08-31.md:
--     "Wiring `timesheet_compute_lines_v1` to aggregate from allocations is
--     the follow-up slice after the table exists; timesheets remain
--     honest-empty until then."
--   * docs/APPLIED_LEDGER.md row for ledger version 20260831161725
--     (20260829140000_work_hour_allocations_v1): "timesheets stay
--     honest-empty until the compute-wiring follow-up (same owner-approved
--     sequence) lands."
-- The annotation states the ROUTE (RED review class, owner review before
-- apply), never an auto-merge or auto-apply pass. Safety class: RED by
-- classification — it replaces the body of an existing SECURITY DEFINER
-- function. ZERO tables, columns, policies, grants (beyond re-asserting the
-- already-reviewed REVOKEs), triggers or indexes are created, dropped or
-- modified. ZERO DML at apply time. ONE function body is replaced, with its
-- signature unchanged.
--
-- 20260831170000 — timesheets learn to read the canonical hour FACT
-- (M3 compute wiring, package 0010 follow-up slice).
--
-- ── WHAT THIS CLOSES ───────────────────────────────────────────────────────
-- 20260829140000 (applied to production 2026-08-31, ledger 20260831161725)
-- created `work_hour_allocations`: the canonical row-level allocation —
-- one (worker, date, object, hours) fact — that timesheets were designed to
-- aggregate FROM. But `timesheet_compute_lines_v1` still read ONLY
-- `journal_entry_metrics`, so a period full of recorded allocations still
-- computed zero hours. This migration wires the compute path:
--
--     work_hour_allocations ─┐
--                            ├─→ timesheet_compute_lines_v1 → snapshot
--     journal_entry_metrics ─┘
--
-- The journal derivation is preserved VERBATIM from the currently applied
-- body (20260819220000): same CTEs, same rule A / rule B selection, same
-- task attribution, same conflicts array, same unit handling. For a worker
-- with no allocations in the period, the output is byte-identical to the
-- previous body except for the doc-level 'source' string.
--
-- ── ALLOCATION-WINS DEDUPE: one hour fact never counts twice ───────────────
-- An allocation MAY link a journal entry (`journal_entry_id`) — the explicit
-- "this narrative describes these hours" bridge. If that entry ALSO carries
-- its own time metrics, a naive union would count the same worked hours from
-- both sources. So: a journal entry referenced by a LIVE allocation row's
-- journal_entry_id is EXCLUDED from the journal-derived lines — the
-- allocation wins, because it is the row-level canonical fact the timesheet
-- exists to aggregate (20260829140000's stated direction: CANONICAL
-- ALLOCATION ROWS → aggregation → timesheet snapshot). The entry's hours
-- still count exactly once, through the allocation line that references it.
--
-- ── WHICH ALLOCATIONS COUNT ────────────────────────────────────────────────
--   * superseded_by IS NULL  — a corrected row is replaced by its correction,
--     never counted alongside it (the journal_entries idiom);
--   * status <> 'rejected'   — a rejected allocation is a refused claim, not
--     a fact. 'recorded', 'submitted' and 'approved' all count: approval of
--     the PERIOD belongs to the timesheet, not to the row.
--
-- ── TENANT SCOPE ───────────────────────────────────────────────────────────
-- The alloc filter is the DIRECT `organization_id` column on
-- work_hour_allocations — the RLS tenant key, denormalised there on purpose
-- ("it is the RLS tenant key, and RLS must not depend on a join",
-- 20260829140000). No join decides tenancy. Org A's allocations can never
-- appear on org B's sheet because the predicate is a column equality on the
-- row itself.
--
-- One SECDEF disclosure defence on top (same class as the task_link scope in
-- 20260819220000): the object/project TITLE join requires
-- wo.organization_id = p_organization_id. `work_hour_allocations` does not
-- constrain work_object_id to the same organization, and this function reads
-- `work_objects` with RLS bypassed — without the predicate, an allocation
-- row pointing at another org's object would freeze that org's object NAME
-- into this org's timesheet. Strictly narrowing: it can only ever WITHHOLD a
-- title (falling back to the note's first line, else ''), never invent one,
-- and it touches no hour.
--
-- ── ORDER AND CAP ──────────────────────────────────────────────────────────
-- All lines — both sources — are ordered by day (allocations before journal
-- lines within a day, then by id, deterministic), and the 500-line cap
-- applies ACROSS both sources. Totals (totalHours / totalDayUnits /
-- lineCount) sum BOTH sources post-dedupe. The doc-level 'source' becomes
-- 'work_hour_allocations+journal_entry_metrics'.
--
-- ── WHAT IS DELIBERATELY NOT CHANGED ───────────────────────────────────────
-- The function signature (so the SECDEF posture and every existing revoke
-- stay exactly as reviewed — the three internal callers in 20260817170000
-- pick the new body up automatically); the journal derivation and its task
-- attribution (verbatim); the work-day resolution; the unit handling ('days'
-- still never becomes hours; allocations are hours by definition —
-- hours_numeric); the conflicts array; and `journal_entry_work_items` (still
-- deprecated, still never written).
--
-- ROLLBACK: supabase/rollbacks/20260831170000_timesheet_compute_allocations_v1.down.sql
-- restores the 20260819220000 body verbatim.
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
  -- THE CANONICAL HOUR FACT (M3). Filtered by the DIRECT organization_id
  -- column — the RLS tenant key, no join decides tenancy. Superseded rows are
  -- replaced by their correction; rejected rows are refused claims, not facts.
  with alloc as (
    select a.id,
           a.journal_entry_id,
           a.work_date,
           a.hours_numeric,
           a.note,
           a.source,
           a.work_object_id
      from public.work_hour_allocations a
     where a.worker_id = p_worker_id
       and a.organization_id = p_organization_id
       and a.work_date >= p_start
       and a.work_date <= p_end
       and a.superseded_by is null
       and a.status <> 'rejected'
  ),
  live as (
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
    select * from live
     where work_day >= p_start and work_day <= p_end
       -- ALLOCATION-WINS DEDUPE: an entry referenced by a live allocation's
       -- journal_entry_id is excluded here — its hours count exactly once,
       -- through the allocation line that references it. The subquery keeps
       -- only non-null links, so NOT IN can never collapse on a NULL.
       and live.id not in (
         select al.journal_entry_id
           from alloc al
          where al.journal_entry_id is not null
       )
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
  -- The allocation lines. Title: the operator's own note (first line), else
  -- the work object's name, else '' — never invented text. The object/project
  -- title join carries the SECDEF disclosure defence: only THIS
  -- organization's object may contribute its name (see header). The
  -- allocation's own columns (id, hours, date, work_object_id) are org-A row
  -- data and always travel.
  alloc_shaped as (
    select a.id,
           a.journal_entry_id,
           a.work_date,
           a.hours_numeric,
           a.source,
           a.work_object_id,
           wo.name  as object_title,
           wo.project_id,
           pj.title as project_title,
           case when length(t.title_raw) > 120
                then left(t.title_raw, 119) || chr(8230)
                else t.title_raw end as title
      from alloc a
      left join public.work_objects wo
        on wo.id = a.work_object_id
       and wo.organization_id = p_organization_id
      left join public.projects pj on pj.id = wo.project_id
      cross join lateral (
        select coalesce(
                 nullif(btrim(split_part(replace(coalesce(a.note, ''), chr(13), ''), chr(10), 1)), ''),
                 wo.name,
                 ''
               ) as title_raw
      ) t
  ),
  -- Both sources shaped to ONE sortable line shape, so the day ordering and
  -- the 500-line cap apply ACROSS them. src_ord 0 puts a day's allocations
  -- before its journal lines (the canonical fact first); sort_id/sort_frag
  -- make the order deterministic. For a worker with no allocations this
  -- reduces to exactly the previous body's ordering
  -- (work_day, entry_id, frag_index nulls first).
  a_lines as (
    select al.work_date  as line_day,
           0             as src_ord,
           al.id         as sort_id,
           -1            as sort_frag,
           al.hours_numeric as hours,
           0::numeric    as day_units,
           jsonb_build_object(
             'lineKey',        'alloc:' || al.id::text,
             'allocationId',   al.id,
             'journalEntryId', al.journal_entry_id,
             'day',            to_char(al.work_date, 'YYYY-MM-DD'),
             'title',          al.title,
             'value',          al.hours_numeric,
             'unit',           'hours',
             'hours',          al.hours_numeric,
             'dayUnits',       0,
             'derivedFrom',    'work_hour_allocation',
             'metricSource',   al.source,
             'workObjectId',   al.work_object_id,
             'objectTitle',    al.object_title,
             'projectId',      al.project_id,
             'projectTitle',   al.project_title
           ) as line
      from alloc_shaped al
  ),
  j_lines as (
    select c.work_day    as line_day,
           1             as src_ord,
           c.entry_id    as sort_id,
           coalesce(c.frag_index, -1) as sort_frag,
           c.hours,
           c.day_units,
           jsonb_build_object(
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
           ) as line
      from capped c
      left join public.projects p on p.id = c.project_id
      -- Both 1:1 by construction: task_link is grouped by entry_id, work_tasks
      -- is keyed by its primary key. Neither can fan a line out.
      left join task_link tl on tl.entry_id = c.entry_id
      left join public.work_tasks wt on wt.id = tl.task_id
  ),
  combined as (
    select u.line_day, u.src_ord, u.sort_id, u.sort_frag,
           u.hours, u.day_units, u.line
      from (select * from a_lines union all select * from j_lines) u
     order by u.line_day, u.src_ord, u.sort_id, u.sort_frag
     limit 500
  ),
  agg as (
    select coalesce(jsonb_agg(cb.line
             order by cb.line_day, cb.src_ord, cb.sort_id, cb.sort_frag), '[]'::jsonb) as arr,
           count(*)                        as line_count,
           coalesce(sum(cb.hours), 0)      as total_hours,
           coalesce(sum(cb.day_units), 0)  as total_day_units
      from combined cb
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
    'source',      'work_hour_allocations+journal_entry_metrics',
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
-- REVOKEs written by 20260817170000 and re-asserted by 20260818150000 and
-- 20260819220000 still stand. Re-asserted here for the same reason they were
-- there: a reader must not have to prove absence to know this function is not
-- callable directly.
revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from public;
revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from anon;
revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from authenticated;

commit;
