-- ===========================================================================
-- CLASSIFY the journal entries whose engagement context may be wrong.
--
-- READ-ONLY. It writes nothing and corrects nothing. Correction is a separate,
-- per-entry, hash-chained act (`journal_entry_supersede_v2`), and only for
-- entries this script proves AUTO_CORRECTABLE.
--
-- ── WHAT "MISROUTED" MEANS ─────────────────────────────────────────────────
-- An entry sits in an engagement context with `organization_id IS NULL` while
-- its author ALSO holds an active organization-scoped context.
-- `timesheet_compute_lines_v1` scopes by `ec.organization_id`, so those hours
-- can never reach any employer.
--
-- ── THE CLASSES (owner decision 2026-08-20) ────────────────────────────────
--   AUTO_CORRECTABLE — the correct context is DETERMINISTICALLY provable from
--     existing evidence: the entry carries a project, or a live task link
--     whose task resolves to exactly one organization, AND the author holds
--     exactly one active context in that organization.
--   AMBIGUOUS — everything else. Left untouched and surfaced for a human.
--
-- ── WHY "ONE EMPLOYER AND NO EVIDENCE" IS *NOT* AUTO_CORRECTABLE ───────────
-- Preferring the single employer is a DEFAULT for new entries (rule B of
-- lib/journal/engagement-context-selection). It is not a licence to rewrite
-- history. Reading the real entries shows why: several are plainly personal or
-- third-party — walking a dog, renovating one's own house, an hour driving and
-- three on a shop till. Re-pointing those at an employer would fabricate an
-- employment record, which is worse than leaving them unreachable.
-- ===========================================================================

with misrouted as (
  select je.id            as entry_id,
         je.worker_id,
         ec.profile_id,
         je.project_id,
         je.superseded_by,
         coalesce(wd.value_text::date, (je.created_at at time zone 'utc')::date) as work_day
    from public.journal_entries je
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
    left join lateral (
      select m.value_text from public.journal_entry_metrics m
       where m.entry_id = je.id and m.metric_slug = 'work_date'
         and m.value_text ~ '^\d{4}-\d{2}-\d{2}$'
       order by m.created_at desc, m.id desc limit 1) wd on true
   where ec.organization_id is null
     and je.deleted_at is null
     and exists (
       select 1 from public.engagement_contexts o
        where o.profile_id = ec.profile_id
          and o.organization_id is not null
          and o.status = 'active')
),
-- The organization the entry's OWN evidence points at, if any and if unique.
evidence_org as (
  select m.entry_id,
         count(distinct o.org) as org_count,
         min(o.org::text)::uuid as org
    from misrouted m
    left join lateral (
      -- via the entry's project
      select p.organization_id as org
        from public.projects p where p.id = m.project_id
      union
      -- via a LIVE task link, through the task's project or object spine
      select coalesce(pr.organization_id, wo.organization_id) as org
        from public.journal_entry_tasks jt
        join public.work_tasks wt         on wt.id = jt.task_id
        left join public.projects pr      on pr.id = wt.project_id
        left join public.work_objects wo  on wo.id = wt.object_id
       where jt.entry_id = m.entry_id and jt.unlinked_at is null
    ) o on o.org is not null
   group by m.entry_id
),
-- Active organization contexts the author held ON the work day.
applicable as (
  select m.entry_id,
         count(*) as ctx_count,
         min(ec.id::text)::uuid as only_ctx,
         min(ec.organization_id::text)::uuid as only_org
    from misrouted m
    join public.engagement_contexts ec
      on ec.profile_id = m.profile_id
     and ec.organization_id is not null
     and ec.status = 'active'
     and (ec.started_at is null or ec.started_at <= m.work_day)
     and (ec.ended_at   is null or ec.ended_at   >= m.work_day)
   group by m.entry_id
),
classified as (
  select m.entry_id,
         m.profile_id,
         m.work_day,
         coalesce(e.org_count, 0) as evidence_orgs,
         coalesce(a.ctx_count, 0) as applicable_org_contexts,
         case
           when coalesce(e.org_count, 0) = 1
            and exists (
              select 1 from public.engagement_contexts ec2
               where ec2.profile_id = m.profile_id
                 and ec2.organization_id = e.org
                 and ec2.status = 'active')
           then 'AUTO_CORRECTABLE'
           else 'AMBIGUOUS'
         end as class,
         case when coalesce(e.org_count, 0) = 1 then e.org end as proven_org
    from misrouted m
    left join evidence_org e on e.entry_id = m.entry_id
    left join applicable   a on a.entry_id = m.entry_id
)
select class,
       count(*)                                   as entries,
       count(distinct profile_id)                 as people,
       min(work_day)                              as earliest,
       max(work_day)                              as latest,
       string_agg(distinct applicable_org_contexts::text, ',' order by applicable_org_contexts::text)
                                                  as applicable_context_counts
  from classified
 group by class
 order by class;
