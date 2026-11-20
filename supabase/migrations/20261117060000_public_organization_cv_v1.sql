-- @human-gate-approved  (acknowledgement only: RED class — SECURITY DEFINER + REVOKE/GRANT + EXECUTE to anon; draft + needs-human-gate, OWNER APPLIES — NOT applied by the agent)
-- ============================================================================
-- 20261117060000 — PUBLIC COMPANY LIVING CV: numbers only, computed in the
-- database (register 3.36).
--
-- RED (owner-gated). PREPARED, NOT APPLIED. Draft PR + `needs-human-gate`;
-- apply only via Supabase MCP `apply_migration` after the owner approves this
-- exact SQL. Never `supabase db push`. The `@human-gate-approved` line above is
-- an ACKNOWLEDGEMENT of the four flags it names, not an approval: it lets CI
-- run, and keeps this PR RED (draft, label, owner decides, owner applies).
--
-- OWNER RULINGS (2026-11-16 and 2026-11-17, relayed by the coordinator):
--   * show the company CV on the public company profile — aggregated data
--     only, a minimum group of 5 people, only while the public profile is on,
--     no personal data;
--   * NOT through unbounded service-role access: a narrow database function
--     that computes only the aggregates, SECURITY DEFINER with a fixed
--     search_path, gated on public_profile_enabled, k >= 5 applied INSIDE the
--     database, returning numbers only. No record, name or text is loaded
--     into application memory;
--   * the internal-project rule and #3421's education rule in the same
--     function.
--
-- WHAT IT RETURNS — one row of numbers, or NO ROW:
--   projects_running / projects_completed   counts only
--   journal_people / journal_hours          the journal block
--   journal_first_month / journal_last_month  'YYYY-MM'
--   history_people / history_day_hours      the organization's own imported records
--   history_first_month / history_last_month  'YYYY-MM'
-- No id, name, title, place, text or day-precise date exists in the shape.
--
-- THE GATES, all inside this function:
--   1. organizations.public_profile_enabled must be exactly true, else no row.
--   2. A block is published only with >= 5 distinct people behind it; a block
--      below that is NULL (never rounded, never shown). No block passes ->
--      no row at all.
--   3. Projects count only when a PASSING block points at them (internal
--      projects with no people-backed work are not counted): the journal's
--      engagement contexts (engagement_contexts.project_id) and the live
--      imported records (organization_evidence_records.project_id). Fragment
--      projects (record_state = 'duplicate') never count.
--   4. Hours are rounded to the nearest 10 h, so two snapshots around one
--      person's change cannot be subtracted to recover that person's hours.
--
-- THE COUNTING RULES — the existing ones, not new ones:
--   * Journal entries belong to the organization ONLY through their engagement
--     (journal_entries.engagement_context_id -> engagement_contexts.organization_id).
--   * #3421 (education rule, owner 2026-11-15): a learning relationship
--     (relationship_types.category = 'education') counts only while the
--     engagement is active AND journal review is on for it — the predicate of
--     20261115120000's journal_entries_select, verbatim, fail-closed: an
--     unknown relationship type counts only under that same condition.
--   * #3474 (former employer, 20261118164500): outside `education`, a relationship counts while it
--     runs; once ended, only the retained history — entries whose original record was created
--     before the end of the end day (UTC), via that migration's journal_entry_chain_root_at_v1.
--     A relationship in any other state (or ended without an end date) counts nothing.
--     APPLY AFTER 20261118164500 (this function calls its helper at run time).
--   * Live entries and "one chain counted once": the predicate of
--     timesheet_compute_lines_v1 (20260831170000) — not deleted, not
--     superseded, and not an original that a live correction replaces
--     (lib/journal/counted-once.ts).
--   * Hours per entry: the canonical work-time rule as that function mirrors
--     it (lib/journal/work-time.ts, owner ruling 2026-08-18): fragment_time
--     rows (first per index) win; otherwise the latest entry-level `quantity`
--     with a TIME unit; hours and minutes/60 rounded per line to 2 dp; `days`
--     never become hours.
--   * Work day: the latest valid `work_date` metric, else the UTC creation
--     date. Only work on or before today (UTC) counts.
--   * Imported records: the organization's OWN records that are not
--     superseded (no `corrected` event) and not withdrawn (latest `withdrawn`
--     newer than latest `reinstated`) — lib/organization-evidence/
--     evidence-state.ts. Day hours are the hours of records that are not
--     period aggregates (a record with no activity_date but a start and end
--     is a period figure, never added in). Months span activity_date,
--     period_start and period_end, as the member view does.
--
-- NOT IN IT (said, not hidden): the journal's "confirmed by the organization"
-- hours. That is the independent-review rule (lib/journal/review-status.ts),
-- which has no SQL mirror; publishing it would mean a second copy of that
-- rule. The public CV shows recorded hours only.
--
-- SECURITY:
--   * SECURITY DEFINER, `set search_path = public, pg_temp`, STABLE, no DML,
--     no dynamic SQL. Every reference is schema-qualified.
--   * EXECUTE to anon and authenticated (an anonymous visitor reads the public
--     page); revoked from public. That grant is why this is RED.
--   * No table grant changes, no RLS policy changes, no data changes.
--
-- PRE-APPLY CHECK (read-only):
--   select to_regprocedure('public.get_public_organization_cv_v1(uuid)');  -- expect NULL
-- POST-APPLY VERIFICATION (read-only):
--   select * from public.get_public_organization_cv_v1('<an org with the profile off>');  -- no row
--   then the production walk of an opted-in synthetic organization with >= 5 people.
--
-- ROLLBACK: supabase/rollbacks/20261117060000_public_organization_cv_v1.down.sql
-- ============================================================================

begin;

create or replace function public.get_public_organization_cv_v1(p_organization_id uuid)
returns table (
  projects_running     integer,
  projects_completed   integer,
  journal_people       integer,
  journal_hours        numeric,
  journal_first_month  text,
  journal_last_month   text,
  history_people       integer,
  history_day_hours    numeric,
  history_first_month  text,
  history_last_month   text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c_min_people constant integer := 5;
  c_hours_step constant numeric := 10;
  v_today      date := (now() at time zone 'utc')::date;
  v_enabled    boolean;
  v_j_people   integer;
  v_j_entries  integer;
  v_j_hours    numeric;
  v_j_first    date;
  v_j_last     date;
  v_h_people   integer;
  v_h_records  integer;
  v_h_hours    numeric;
  v_h_first    date;
  v_h_last     date;
  v_j_pass     boolean;
  v_h_pass     boolean;
  v_running    integer;
  v_completed  integer;
begin
  if p_organization_id is null then
    return;
  end if;

  -- GATE 1: the organization's own opt-in.
  select o.public_profile_enabled
    into v_enabled
    from public.organizations o
   where o.id = p_organization_id;
  if v_enabled is distinct from true then
    return;
  end if;

  -- ── The journal block ────────────────────────────────────────────────────
  with ctx as (
    -- 20261118164500 (#3474, former employer): outside `education`, a relationship counts while it
    -- runs (active / paused); once ENDED, only what the organization retains — entries whose original
    -- record was created before the end of the end day (UTC), the predicate of journal_entries_select
    -- and org_retains_journal_entry_v1, via the same journal_entry_chain_root_at_v1. `retain_until`
    -- is NULL when every entry of the context counts.
    select ec.id,
           case when ec.status = 'ended'
                then ((ec.ended_at + 1)::timestamp at time zone 'UTC') end as retain_until
      from public.engagement_contexts ec
     where ec.organization_id = p_organization_id
       and (
         (exists (
            select 1 from public.relationship_types rt
             where rt.slug = ec.relationship_slug
               and rt.category <> 'education'
          )
          and (ec.status in ('active', 'paused') or (ec.status = 'ended' and ec.ended_at is not null)))
         or (ec.status = 'active' and ec.journal_review_enabled is true)
       )
  ),
  live as (
    select je.id,
           je.worker_id,
           coalesce(wd.value_text::date, (je.created_at at time zone 'utc')::date) as work_day
      from public.journal_entries je
      join ctx on ctx.id = je.engagement_context_id
                 and (ctx.retain_until is null
                      or public.journal_entry_chain_root_at_v1(je.id) < ctx.retain_until)
      left join lateral (
        select m.value_text
          from public.journal_entry_metrics m
         where m.entry_id = je.id
           and m.metric_slug = 'work_date'
           and m.value_text ~ '^\d{4}-\d{2}-\d{2}$'
         order by m.created_at desc, m.id desc
         limit 1
      ) wd on true
     where je.deleted_at is null
       and je.superseded_by is null
       and not exists (
         select 1
           from public.journal_entries c
          where c.correction_of = je.id
            and c.deleted_at is null
            and c.superseded_by is null
       )
  ),
  counted as (
    select * from live where work_day <= v_today
  ),
  frag as (
    select distinct on (m.entry_id, m.value_text::int)
           m.entry_id, m.value_numeric as value, m.unit_slug as unit
      from public.journal_entry_metrics m
      join public.productivity_units u on u.slug = m.unit_slug and u.category = 'time'
     where m.entry_id in (select id from counted)
       and m.metric_slug = 'fragment_time'
       and m.value_numeric is not null
       and m.value_numeric > 0
       and m.value_text ~ '^[1-9][0-9]*$'
     order by m.entry_id, m.value_text::int, m.created_at, m.id
  ),
  qty as (
    select distinct on (m.entry_id)
           m.entry_id, m.value_numeric as value, m.unit_slug as unit
      from public.journal_entry_metrics m
      join public.productivity_units u on u.slug = m.unit_slug and u.category = 'time'
     where m.entry_id in (select id from counted)
       and m.metric_slug = 'quantity'
       and m.value_numeric is not null
       and m.value_numeric > 0
     order by m.entry_id, m.created_at desc, m.id desc
  ),
  lines as (
    select f.entry_id, f.value, f.unit from frag f
    union all
    select q.entry_id, q.value, q.unit
      from qty q
     where not exists (select 1 from frag f where f.entry_id = q.entry_id)
  )
  select count(distinct c.worker_id)::integer,
         count(*)::integer,
         coalesce((
           select sum(case l.unit
                        when 'hours'   then round(l.value, 2)
                        when 'minutes' then round(l.value / 60.0, 2)
                        else 0
                      end)
             from lines l
         ), 0),
         min(c.work_day),
         max(c.work_day)
    into v_j_people, v_j_entries, v_j_hours, v_j_first, v_j_last
    from counted c;

  -- ── The imported-records block (the organization's own books) ───────────
  with rec as (
    select r.organization_person_id, r.activity_date, r.period_start, r.period_end, r.hours
      from public.organization_evidence_records r
     where r.organization_id = p_organization_id
       and not exists (
         select 1 from public.organization_evidence_events e
          where e.record_id = r.id and e.event_type = 'corrected'
       )
       and not coalesce((
         select max(e.created_at) from public.organization_evidence_events e
          where e.record_id = r.id and e.event_type = 'withdrawn'
       ) > coalesce((
         select max(e.created_at) from public.organization_evidence_events e
          where e.record_id = r.id and e.event_type = 'reinstated'
       ), '-infinity'::timestamptz), false)
  )
  select count(distinct rec.organization_person_id)::integer,
         count(*)::integer,
         coalesce(sum(rec.hours) filter (
           where not (rec.activity_date is null and rec.period_start is not null and rec.period_end is not null)
         ), 0),
         least(min(rec.activity_date), min(rec.period_start), min(rec.period_end)),
         greatest(max(rec.activity_date), max(rec.period_start), max(rec.period_end))
    into v_h_people, v_h_records, v_h_hours, v_h_first, v_h_last
    from rec;

  -- GATE 2: k >= 5 per block; no passing block -> no row.
  v_j_pass := coalesce(v_j_people, 0) >= c_min_people and coalesce(v_j_entries, 0) > 0;
  v_h_pass := coalesce(v_h_people, 0) >= c_min_people and coalesce(v_h_records, 0) > 0;
  if not v_j_pass and not v_h_pass then
    return;
  end if;

  -- GATE 3: only projects a passing block points at.
  with linked as (
    select ec.project_id as id
      from public.engagement_contexts ec
     where v_j_pass
       and ec.organization_id = p_organization_id
       and ec.project_id is not null
       and (
         (exists (
            select 1 from public.relationship_types rt
             where rt.slug = ec.relationship_slug
               and rt.category <> 'education'
          )
          and (ec.status in ('active', 'paused') or (ec.status = 'ended' and ec.ended_at is not null)))
         or (ec.status = 'active' and ec.journal_review_enabled is true)
       )
    union
    select r.project_id
      from public.organization_evidence_records r
     where v_h_pass
       and r.organization_id = p_organization_id
       and r.project_id is not null
  )
  select count(*) filter (where p.status is distinct from 'completed')::integer,
         count(*) filter (where p.status = 'completed')::integer
    into v_running, v_completed
    from public.projects p
   where p.organization_id = p_organization_id
     and p.record_state is distinct from 'duplicate'
     and p.id in (select id from linked);

  -- GATE 4: coarse hours; numbers and months only.
  return query
  select v_running,
         v_completed,
         case when v_j_pass then v_j_people end,
         case when v_j_pass then round(v_j_hours / c_hours_step) * c_hours_step end,
         case when v_j_pass then to_char(v_j_first, 'YYYY-MM') end,
         case when v_j_pass then to_char(v_j_last, 'YYYY-MM') end,
         case when v_h_pass then v_h_people end,
         case when v_h_pass then round(v_h_hours / c_hours_step) * c_hours_step end,
         case when v_h_pass then to_char(v_h_first, 'YYYY-MM') end,
         case when v_h_pass then to_char(v_h_last, 'YYYY-MM') end;
end;
$$;

comment on function public.get_public_organization_cv_v1(p_organization_id uuid) is
  'Public company Living CV (register 3.36): aggregates only (counts, hours rounded to 10, months), k>=5 people per block, nothing unless the organization''s public_profile_enabled is true. Numbers only; no id, name, place, title or text.';

revoke all on function public.get_public_organization_cv_v1(p_organization_id uuid) from public;
grant execute on function public.get_public_organization_cv_v1(p_organization_id uuid) to anon, authenticated;

commit;
