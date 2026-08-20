-- ===========================================================================
-- FIND the journal entries whose hours the worker WROTE but the composer
-- never kept, and say which of them are one edit away from becoming real,
-- employer-visible work-time.
--
-- READ-ONLY. It writes nothing and recovers nothing. Recovery is a per-entry
-- act BY THE WORKER through the normal edit flow, which supersedes the entry
-- (hash-chained, `correction_of` set, the original row kept and readable).
-- Nothing here may re-parse an entry and write the result: a parsed duration
-- becomes the worker's claim only when they say so (doctrine §7).
--
-- ── WHY THESE ENTRIES EXIST ────────────────────────────────────────────────
-- Until 20260820 the composer posted fragments only when their status was
-- `confirmed`, and the entry-level duration only when its own status was
-- `confirmed`. Anything still `pending` was dropped SILENTLY while the entry
-- saved and looked successful. Measured over the 26 live entries: 16 stated
-- hours, 4 kept them, 14 lost them, and all 14 had zero confirmed fragments.
--
-- The save now refuses to discard quietly, so no NEW entry can join this set.
-- The fix is forward-only: these entries keep their text and their lost hours
-- until a worker re-opens and keeps them.
--
-- ── THE COLUMNS ────────────────────────────────────────────────────────────
--   in_org_context  the entry already sits in an organization-scoped context,
--                   so recovering it lands straight on that employer's
--                   timesheet. Entries in an org-less context need the context
--                   question answered too (see
--                   docs/reconciliation/engagement-context-misroutes-v1.md).
-- ===========================================================================

with live as (
  select je.id, je.worker_id, je.original_text, ec.organization_id,
         coalesce(wd.value_text::date, (je.created_at at time zone 'utc')::date) as work_day
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
    left join lateral (
      select m.value_text from public.journal_entry_metrics m
       where m.entry_id = je.id and m.metric_slug = 'work_date'
         and m.value_text ~ '^\d{4}-\d{2}-\d{2}$'
       order by m.created_at desc, m.id desc limit 1) wd on true
   where je.deleted_at is null and je.superseded_by is null
),
flagged as (
  select l.*,
         -- the worker plainly wrote a duration: "9h", "6,5h", "3.5 val", "10 h"
         (l.original_text ~* '(^|[^0-9])[0-9]+([.,][0-9]+)?\s*(h|val)([^a-ząčęėįšųūž]|$)')
           as text_states_hours,
         exists (
           select 1 from public.journal_entry_metrics m
             join public.productivity_units u on u.slug = m.unit_slug and u.category = 'time'
            where m.entry_id = l.id
              and m.metric_slug in ('fragment_time','quantity')
              and m.value_numeric > 0) as kept_its_hours
    from live l
)
select case
         when organization_id is not null then 'RECOVERABLE_IN_ORG_CONTEXT'
         else 'RECOVERABLE_BUT_CONTEXT_UNRESOLVED'
       end                              as class,
       count(*)                         as entries,
       count(distinct worker_id)        as workers,
       min(work_day)                    as earliest,
       max(work_day)                    as latest
  from flagged
 where text_states_hours and not kept_its_hours
 group by 1
 order by 1;
