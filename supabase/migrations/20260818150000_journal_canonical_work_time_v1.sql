-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after the lead session's
-- verification. Never `db push`.
-- Rollback:  supabase/rollbacks/20260818150000_journal_canonical_work_time_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (replaces the body of an existing
-- SECURITY DEFINER function). SAFETY CLASS: RED by classification, but the
-- blast radius is measured and zero: `timesheets` has 0 rows and 0 lifetime
-- inserts in production, so no frozen snapshot exists that this could change.
-- Annotation pre-approved by the owner ruling of 2026-08-18 quoted below.
-- ZERO tables, policies, grants, triggers or columns are created, dropped or
-- modified. ZERO DML at apply time. ONE function body is replaced and two
-- COMMENTs are set.
--
-- 20260818150000 — canonical work-time truth: the Work Journal's own metrics.
--
-- ── OWNER RULING 2026-08-18 (verbatim intent) ───────────────────────────────
--   Use the existing Work Journal-derived data as the canonical source.
--   `journal_entry_metrics` is the canonical persisted source for derived,
--   structured work-time metrics. Do NOT create a second equivalent hours
--   truth merely to populate `journal_entry_work_items`.
--   The intended architecture is:
--     WORK JOURNAL ENTRY -> ORIGINAL USER EVIDENCE / FACT
--       -> STRUCTURED DERIVED METRICS -> CANONICAL WORK-TIME VALUE
--       -> TIMESHEET -> WORKLOAD / CAPACITY -> REPORTING
--
-- ── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
-- `timesheet_compute_lines_v1` derived its lines from
-- `journal_entry_work_items` — a table with ZERO lifetime inserts and no
-- writer in any migration or any TypeScript path. Every timesheet could only
-- ever be empty, and `lib/planning` read the same empty table for the
-- workload strip. The seam was already half-wired: the SAME function read
-- `work_date` from `journal_entry_metrics` while reading HOURS from the empty
-- table. The hours were in `journal_entry_metrics` the whole time.
--
-- Three different computations claimed to know a worker's hours and DISAGREED
-- on real production rows. On entry 3c7d80e3 (2026-07-02) they gave 0 h
-- (this function), 5 h (the calendar's entry-level `quantity` read) and 9 h
-- (the reviewer inbox re-parsing the raw text). This migration makes ONE of
-- them canonical; `apps/web/lib/journal/work-time.ts` is its byte-for-byte
-- TypeScript mirror and a guard test pins the pair together.
--
-- ── THE RULE (deterministic; double counting is structurally impossible) ────
-- Per live journal entry, scoped to the worker and to the organization behind
-- the entry's OWN engagement context, exactly ONE work-time source is chosen:
--   A. `fragment_time` metric rows — a per-activity duration, index-bound to
--      the worker's own `parsed_fragment` evidence phrase and
--      `fragment_activity` label. One line each. First row per index wins.
--   B. otherwise the entry-level `quantity` metric, and ONLY when its unit is
--      a TIME unit (`productivity_units.category = 'time'`). One line for the
--      whole entry. Latest row wins.
--   C. otherwise the entry contributes NO work-time line. It stays a journal
--      fact; it is simply not an hours fact.
-- A and B are NEVER summed. An entry carrying both reports the ignored
-- entry-level value in `conflicts` — visible and auditable, never silently
-- dropped and never migrated into an authoritative number.
--
-- UNITS: `hours` and `minutes` total into hours (minutes/60, rounded per line
-- to 2dp — the same place and precision the TypeScript mirror rounds).
-- `days` NEVER becomes hours: there is no approved workday length, so day
-- units total separately. A non-time unit (square_meters, pieces, …) is
-- productivity OUTPUT and can never enter work time.
--
-- EVIDENCE + PROVENANCE: every line carries the metric row it came from
-- (`metricId`), that row's own `source` (worker_input | ai_extracted |
-- manager_corrected) and which rule produced it (`derivedFrom`), so a derived
-- hour is always traceable back to the worker's own words.
--
-- LIFECYCLE (unchanged, and now actually reachable): deleted, superseded and
-- live-corrected entries are excluded, so an edit re-derives rather than
-- accumulates. Draft/reopened timesheets recompute on refresh; a SUBMITTED
-- snapshot stays frozen by the existing trigger.
--
-- WHAT IS DELIBERATELY NOT DONE (binding):
--   - `journal_entry_work_items` is NOT populated. It is marked deprecated
--     below and keeps its 0 rows. Nothing in this migration writes to it, and
--     nothing reads from it any more.
--   - NO second hours store is created; NO ambiguous historical value is
--     migrated; NO original journal evidence is touched, rewritten or deleted.
--   - NO workday length, NO payroll, NO pay rate, NO overtime rule.
--   - NO table, policy, grant or trigger change; the function keeps its exact
--     signature, so the reviewed anon/SECDEF allowlist is unaffected.
-- ============================================================================

begin;

-- ── 0. Safety assertions — the truths this rule builds on must exist ────────
do $$
begin
  if to_regclass('public.journal_entry_metrics') is null then
    raise exception 'journal_entry_metrics missing — apply 0013 before this migration';
  end if;
  if to_regclass('public.productivity_units') is null then
    raise exception 'productivity_units missing — apply 0013/0017 before this migration';
  end if;
  if to_regclass('public.engagement_contexts') is null then
    raise exception 'engagement_contexts missing — apply 0013 before this migration';
  end if;
  if to_regclass('public.timesheets') is null then
    raise exception 'timesheets missing — apply 20260817170000 before this migration';
  end if;
  if not exists (
    select 1 from public.productivity_units where slug = 'hours' and category = 'time'
  ) then
    raise exception 'productivity_units time category missing — apply 0017 before this migration';
  end if;
end $$;

-- ── 1. The canonical derivation ─────────────────────────────────────────────
-- Same name, same argument types, same return type, same SECURITY DEFINER and
-- search_path as 20260817170000 — only the body changes, so every existing
-- REVOKE/GRANT and every caller stays exactly as reviewed.
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

-- The privileges of a `create or replace`d function are preserved, so the
-- REVOKEs written by 20260817170000 still stand. They are re-asserted here
-- ANYWAY: a local `db reset` replays migrations in order, and a security
-- posture that depends on a reader noticing an earlier file is not a posture.
-- This is a re-assertion of the reviewed state, never a widening — there is
-- no GRANT in this migration.
revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from public;
revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from anon;
revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from authenticated;

comment on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) is
  'CANONICAL work-time derivation. Source of truth: journal_entry_metrics '
  '(owner ruling 2026-08-18). Per entry, fragment_time rows win; the '
  'entry-level quantity metric applies only when no fragment time exists; the '
  'two are never summed. TypeScript mirror: apps/web/lib/journal/work-time.ts.';

-- ── 2. Deprecate the duplicate hours store (no data change) ─────────────────
-- The table is NOT dropped: dropping is a destructive DDL and stays an
-- owner-gated action. It keeps its 0 rows, its RLS and its grants. This
-- comment is the durable, in-database record of why nothing writes to it.
comment on table public.journal_entry_work_items is
  'DEPRECATED 2026-08-18 — NOT an hours authority. Built by 20260601090000 to '
  'persist display-time recognition; adoption never happened (0 lifetime '
  'inserts, no writer). Its hours/unit/work-type/evidence columns duplicate '
  'journal_entry_metrics (fragment_time / fragment_activity / parsed_fragment / '
  'quantity), which the owner ruling of 2026-08-18 made canonical. Do NOT '
  'populate it to satisfy a reader; there are none. The only semantics it '
  'carried that metrics do not express is a PER-ITEM reviewer decision '
  '(status suggested/confirmed/rejected/needs_clarification) — never built, '
  'and reviewer decisions live per ENTRY in journal_entry_confirmations today.';

commit;
