-- ===========================================================================
-- THE WORK-HOURS FUNNEL — seven stages, deliberately NOT collapsed.
--
-- READ-ONLY. Run it against production whenever you want to know where real
-- usage actually stops. One number ("the chain works, 62%") would hide exactly
-- the thing this is for.
--
-- ── WHY EACH STAGE IS SEPARATE ─────────────────────────────────────────────
-- Every stage is a different failure with a different fix:
--
--   1 hour claim written     a worker typed a duration in their own words.
--                            Zero here is an ADOPTION problem, not a bug.
--   2 structured metric      the duration survived the composer's review step.
--                            The gap 1→2 was 87.5% before 2026-08-20; the
--                            composer can no longer drop one silently.
--   3 employer context       the entry sits in an organization-scoped
--                            engagement context. Hours in an org-less context
--                            are real but can reach no employer, ever, because
--                            timesheet_compute_lines_v1 scopes by organization.
--   4 task attributed        a live evidence link ties the entry to exactly one
--                            work task (chain step A).
--   5 timesheet line         the hours appear on a timesheet snapshot. Needs
--                            someone to create/refresh a timesheet for the
--                            period — a human act, not an automatic one.
--   6 submitted for review   the worker sent that timesheet to their employer.
--   7 approved               a human decided.
--
-- Stages 5-7 count TIMESHEET LINES, not entries: one entry can produce several
-- lines, and a timesheet freezes its own snapshot. They are reported alongside
-- the entry stages rather than merged into them, because mixing the two units
-- is how a funnel starts lying.
--
-- ── HOW TO READ IT ─────────────────────────────────────────────────────────
-- The FIRST stage where the count drops to zero is the current bottleneck.
-- Do not average, do not weight, do not report a single percentage.
-- ===========================================================================

with live as (
  select je.id, je.worker_id, ec.organization_id,
         je.original_text
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
   where je.deleted_at is null and je.superseded_by is null
),
flagged as (
  select l.*,
         -- A DURATION in the worker's own words. Covers the shorthand
         -- ("9h", "6,5h") and the spelled-out Lithuanian forms ("4 val",
         -- "15 minučių"), because stage 1 asks whether the worker stated a
         -- duration at all — not whether it happened to be in hours.
         (l.original_text ~* '(^|[^0-9])[0-9]+([.,][0-9]+)?\s*(h|val|min)([^a-ząčęėįšųūž]|$)'
          or l.original_text ~* '\m(valand|minuč|minuci)')
           as wrote_hours,
         exists (
           select 1 from public.journal_entry_metrics m
             join public.productivity_units u
               on u.slug = m.unit_slug and u.category = 'time'
            where m.entry_id = l.id
              and m.metric_slug in ('fragment_time','quantity')
              and m.value_numeric > 0) as kept_hours,
         exists (
           select 1 from public.journal_entry_tasks jt
            where jt.entry_id = l.id and jt.unlinked_at is null) as task_linked
    from live l
),
lines as (
  select t.status,
         jsonb_array_length(coalesce(t.lines_snapshot->'lines','[]'::jsonb)) as line_count
    from public.timesheets t
)
          select 1 as stage, 'entries: hour claim written'        as name,
                 count(*) filter (where wrote_hours)                                   as n, 'entries' as unit from flagged
union all select 2, 'entries: structured time metric kept',
                 count(*) filter (where wrote_hours and kept_hours),                      'entries' from flagged
union all select 3, 'entries: in an EMPLOYER context',
                 count(*) filter (where wrote_hours and kept_hours and organization_id is not null), 'entries' from flagged
union all select 4, 'entries: attributed to a work task',
                 count(*) filter (where wrote_hours and kept_hours and organization_id is not null and task_linked), 'entries' from flagged
union all select 5, 'timesheet lines: computed',
                 coalesce(sum(line_count), 0),                                            'lines'   from lines
union all select 6, 'timesheet lines: submitted for review',
                 coalesce(sum(line_count) filter (where status in ('submitted','approved','rejected')), 0), 'lines' from lines
union all select 7, 'timesheet lines: approved',
                 coalesce(sum(line_count) filter (where status = 'approved'), 0),         'lines'   from lines
 order by stage;
