-- @human-gate-approved — owner integrated-architecture order 2026-10-24 (Stage 7 forecasting engine): additive forecast storage, mode settings and the significant-change signal; applied only via Supabase MCP apply_migration after review of this exact SQL.
--
-- ── HUMAN GATE ─────────────────────────────────────────────────────────────
-- SAFETY CLASS: RED — SECURITY DEFINER functions, CREATE TRIGGER on existing
-- fact tables, GRANT/REVOKE. Draft PR + `needs-human-gate`. Apply ONLY via
-- Supabase MCP `apply_migration`, never `supabase db push`.
--
-- 20261024130000 — project forecasts v1 (Stage 7 forecasting engine).
--
-- WHAT. A FORECAST is a derived reading of a project's facts (SEP-1: FACT ≠
-- DERIVED ≠ FORECAST). The numbers are computed in the app by ONE
-- deterministic engine (apps/web/lib/forecast/forecast-engine.ts); the
-- database only (1) says which projects are due, (2) hands the scheduler the
-- fact rows, (3) keeps the versions that were said, so they can be compared
-- and measured against what happened, and (4) notes significant changes as
-- they are written.
--
--   organization_forecast_settings  one row per organization that is NOT on
--                                   the default (weekly, enabled). Recompute
--                                   cadence only — never a fact, never a
--                                   price, plan or entitlement.
--   project_forecasts               append-only forecast versions per project
--                                   (version, computed_at, mode, engine
--                                   version, inputs fingerprint, the forecast
--                                   with its sources / assumptions /
--                                   confidence, the comparison with the
--                                   previous version, a numbers-only facts
--                                   summary for the later error measurement).
--   project_forecast_state          one row per project: when it was last
--                                   computed, so an unchanged forecast does
--                                   NOT add a version (bounded storage).
--   project_forecast_signals        insert-only notes "a significant fact of
--                                   project P changed (kind K)", raised by
--                                   AFTER-row triggers inside the writes
--                                   themselves, consumed by the scheduler.
--
-- WHY NO EXISTING STORE FITS. Facts already live in their own tables and stay
-- there; this stores what was SAID about them. The CAL-10 rule "a learned
-- duration must never acquire a table" is untouched: no learned duration, no
-- per-stage estimate, nothing a planning field auto-fills from. A stored
-- forecast version is labelled a forecast in its own table and is never read
-- back as a fact.
--
-- PRODUCTION STABILITY (P0).
--   · The signal trigger does ONE plain INSERT into a table with no foreign
--     key, no unique index and a static CHECK — it cannot fail a user write,
--     and it opens no subtransaction (no EXCEPTION block). UPDATEs that do not
--     touch a forecast-relevant column raise nothing. Absences fan out to at
--     most 20 of the worker's projects.
--   · Insert-only: concurrent writers never wait on each other's signal row.
--   · All forecast work runs in the scheduler (the VPS cron route), bounded
--     per run; nothing is computed inside a user request.
--
-- PRIVACY. No names, no entry text, no e-mail. The facts door returns opaque
-- md5 keys, statuses, dates and numeric metric rows only, and is EXECUTE-able
-- by service_role alone. Mode changes are audited in public.audit_logs (the
-- existing audit table); these tables hold no person identifier.
--
-- ACCESS.
--   · project_forecasts / project_forecast_state: SELECT for whoever can
--     manage the project (canonical can_manage_project); no client writes.
--   · organization_forecast_settings: SELECT for the organization's managers
--     and admins; writes only through forecast_set_mode_v1 (admin only —
--     the cadence follows the plan, so an organization cannot raise its own).
--   · project_forecast_signals: no client access at all.
--
-- ADDITIVE; NO DATA CHANGE to any existing row; no policy on any existing
-- table changes.
--
-- ROLLBACK: supabase/rollbacks/20261024130000_project_forecasts_v1.down.sql
--   drops the triggers, the functions and the four tables (forecast history
--   only; no fact lives here).

begin;

-- ── 1. settings ────────────────────────────────────────────────────────────
create table if not exists public.organization_forecast_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  mode            text not null default 'weekly'
                    check (mode in ('weekly','daily','hourly','live')),
  enabled         boolean not null default true,
  note            text check (note is null or char_length(note) <= 500),
  set_at          timestamptz not null default now()
);
comment on table public.organization_forecast_settings is
  'Forecast RECOMPUTE cadence per organization (Stage 7). Absent row = weekly, enabled. Internal mode ids only (weekly/daily/hourly/live) — never a public label, price, plan or entitlement. Written only by forecast_set_mode_v1 (admin), audited in audit_logs.';

alter table public.organization_forecast_settings enable row level security;
revoke all on table public.organization_forecast_settings from public, anon, authenticated, service_role;
grant select on table public.organization_forecast_settings to authenticated;
drop policy if exists organization_forecast_settings_select on public.organization_forecast_settings;
create policy organization_forecast_settings_select on public.organization_forecast_settings
  for select to authenticated
  using (public.manages_organization(organization_id) or public.is_admin());

-- ── 2. forecast versions ───────────────────────────────────────────────────
create table if not exists public.project_forecasts (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  version         integer not null check (version >= 1),
  mode            text not null check (mode in ('weekly','daily','hourly','live')),
  reason          text not null check (reason in ('first','schedule','signal','signal_max_wait','daily_baseline','manual')),
  engine_version  text not null check (char_length(engine_version) between 1 and 64),
  computed_at     timestamptz not null,
  as_of           date not null,
  inputs_hash     text not null check (inputs_hash ~ '^[0-9a-f]{16}$'),
  forecast        jsonb not null check (jsonb_typeof(forecast) = 'object' and forecast ->> 'kind' = 'forecast'),
  comparison      jsonb check (comparison is null or jsonb_typeof(comparison) = 'object'),
  facts_summary   jsonb not null default '{}'::jsonb check (jsonb_typeof(facts_summary) = 'object'),
  created_at      timestamptz not null default now(),
  unique (project_id, version)
);
create index if not exists project_forecasts_project_computed_idx
  on public.project_forecasts (project_id, computed_at desc);
comment on table public.project_forecasts is
  'FORECAST versions (SEP-1: never a fact). Append-only; one row per version that differed from the previous one. forecast = the engine output incl. sources, assumptions and confidence; comparison = vs the previous version; facts_summary = numbers-only snapshot used to measure the error once the actual is known.';

alter table public.project_forecasts enable row level security;
revoke all on table public.project_forecasts from public, anon, authenticated, service_role;
grant select on table public.project_forecasts to authenticated;
drop policy if exists project_forecasts_select on public.project_forecasts;
create policy project_forecasts_select on public.project_forecasts
  for select to authenticated
  using (public.can_manage_project(project_id));

-- ── 3. per-project scheduler state ─────────────────────────────────────────
create table if not exists public.project_forecast_state (
  project_id       uuid primary key references public.projects(id) on delete cascade,
  last_computed_at timestamptz not null,
  last_version     integer not null check (last_version >= 1),
  last_inputs_hash text not null check (last_inputs_hash ~ '^[0-9a-f]{16}$'),
  last_mode        text not null check (last_mode in ('weekly','daily','hourly','live'))
);
alter table public.project_forecast_state enable row level security;
revoke all on table public.project_forecast_state from public, anon, authenticated, service_role;
grant select on table public.project_forecast_state to authenticated;
drop policy if exists project_forecast_state_select on public.project_forecast_state;
create policy project_forecast_state_select on public.project_forecast_state
  for select to authenticated
  using (public.can_manage_project(project_id));

-- ── 4. significant-change signals (insert-only, no FK, no unique) ──────────
create table if not exists public.project_forecast_signals (
  id         bigint generated always as identity primary key,
  project_id uuid not null,
  kind       text not null check (kind in ('hours','quantities','team','availability','orders','scope','supply','quality','deadline','partner','budget')),
  noted_at   timestamptz not null default now()
);
create index if not exists project_forecast_signals_project_idx
  on public.project_forecast_signals (project_id, id);
comment on table public.project_forecast_signals is
  'A significant fact of a project changed (Stage 7). Raised by the forecast_note_signal_trg triggers inside the writes; consumed (deleted) by forecast_record_v1. No foreign key on purpose: a signal insert must never be able to fail the user''s write.';
alter table public.project_forecast_signals enable row level security;
revoke all on table public.project_forecast_signals from public, anon, authenticated, service_role;

-- ── 5. the signal trigger ──────────────────────────────────────────────────
create or replace function public.forecast_note_signal_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind     text := tg_argv[0];
  v_projects uuid[] := '{}';
  v_worker   uuid;
begin
  if tg_table_name = 'journal_entries' then
    if tg_op = 'UPDATE'
       and new.project_id is not distinct from old.project_id
       and new.deleted_at is not distinct from old.deleted_at
       and new.superseded_by is not distinct from old.superseded_by then
      return null;
    end if;
    if tg_op <> 'DELETE' then v_projects := v_projects || new.project_id; end if;
    if tg_op <> 'INSERT' then v_projects := v_projects || old.project_id; end if;

  elsif tg_table_name = 'work_hour_allocations' then
    select array_agg(o.project_id) into v_projects
      from public.work_objects o
     where o.id in (
       case when tg_op <> 'DELETE' then new.work_object_id end,
       case when tg_op <> 'INSERT' then old.work_object_id end);

  elsif tg_table_name = 'work_tasks' then
    if tg_op = 'UPDATE' then
      if new.status is not distinct from old.status
         and new.parent_task_id is not distinct from old.parent_task_id
         and new.stage_id is not distinct from old.stage_id
         and new.project_id is not distinct from old.project_id
         and new.due_at is not distinct from old.due_at then
        return null;
      end if;
      v_kind := case when new.status = 'done' or old.status = 'done' then 'quantities'
                     when new.due_at is distinct from old.due_at
                          and new.status is not distinct from old.status then 'deadline'
                     else 'scope' end;
    end if;
    if tg_op <> 'DELETE' then v_projects := v_projects || new.project_id; end if;
    if tg_op <> 'INSERT' then v_projects := v_projects || old.project_id; end if;

  elsif tg_table_name = 'project_stages' then
    if tg_op = 'UPDATE' then
      if new.status is not distinct from old.status
         and new.planned_start is not distinct from old.planned_start
         and new.planned_end is not distinct from old.planned_end
         and new.actual_start is not distinct from old.actual_start
         and new.actual_end is not distinct from old.actual_end then
        return null;
      end if;
      v_kind := case when new.status is distinct from old.status
                          and (new.status = 'done' or old.status = 'done') then 'quantities'
                     when new.status is distinct from old.status then 'scope'
                     else 'deadline' end;
    end if;
    if tg_op <> 'DELETE' then v_projects := v_projects || new.project_id; end if;
    if tg_op <> 'INSERT' then v_projects := v_projects || old.project_id; end if;

  elsif tg_table_name = 'projects' then
    if new.end_date is not distinct from old.end_date
       and new.start_date is not distinct from old.start_date
       and new.status is not distinct from old.status then
      return null;
    end if;
    v_projects := array[new.id];

  elsif tg_table_name = 'project_worker_assignments' then
    if tg_op = 'UPDATE' and new.status is not distinct from old.status
       and new.ended_at is not distinct from old.ended_at then
      return null;
    end if;
    if tg_op <> 'DELETE' then v_projects := v_projects || new.project_id; end if;
    if tg_op <> 'INSERT' then v_projects := v_projects || old.project_id; end if;

  elsif tg_table_name = 'team_assignments' then
    if tg_op = 'UPDATE' then
      if new.status is not distinct from old.status
         and new.ended_at is not distinct from old.ended_at
         and new.replaced_by_id is not distinct from old.replaced_by_id then
        return null;
      end if;
      v_kind := 'partner';
    end if;
    if tg_op <> 'DELETE' then v_projects := v_projects || new.project_id; end if;
    if tg_op <> 'INSERT' then v_projects := v_projects || old.project_id; end if;

  elsif tg_table_name = 'worker_absences' then
    -- Only an APPROVED absence is planning-relevant (requested ≠ approved).
    if not ((tg_op <> 'DELETE' and new.status = 'approved')
            or (tg_op <> 'INSERT' and old.status = 'approved')) then
      return null;
    end if;
    if tg_op = 'UPDATE' and new.status is not distinct from old.status
       and new.start_date is not distinct from old.start_date
       and new.end_date is not distinct from old.end_date
       and new.half_day is not distinct from old.half_day then
      return null;
    end if;
    v_worker := case when tg_op = 'DELETE' then old.worker_id else new.worker_id end;
    select array_agg(x.project_id) into v_projects
      from (
        select pwa.project_id
          from public.project_worker_assignments pwa
         where pwa.worker_id = v_worker and pwa.status = 'active'
        union
        select ta.project_id
          from public.workers w
          join public.engagement_contexts ec
            on ec.profile_id = w.profile_id
           and ec.relationship_slug = 'employee'
           and ec.status = 'active'
          join public.team_assignments ta
            on ta.team_org_id = ec.organization_id
           and ta.ended_at is null
         where w.id = v_worker
        limit 20
      ) x;

  elsif tg_table_name = 'work_plan_entries' then
    if tg_op <> 'DELETE' then v_projects := v_projects || new.project_id; end if;
    if tg_op <> 'INSERT' then v_projects := v_projects || old.project_id; end if;

  elsif tg_table_name = 'defects' then
    if tg_op = 'UPDATE' and new.status is not distinct from old.status
       and new.severity is not distinct from old.severity
       and new.due_date is not distinct from old.due_date then
      return null;
    end if;
    if tg_op <> 'DELETE' then v_projects := v_projects || new.project_id; end if;
    if tg_op <> 'INSERT' then v_projects := v_projects || old.project_id; end if;

  elsif tg_table_name = 'defect_corrections' then
    select array_agg(d.project_id) into v_projects
      from public.defects d
     where d.id = case when tg_op = 'DELETE' then old.defect_id else new.defect_id end;

  elsif tg_table_name = 'task_dependencies' then
    select array_agg(t.project_id) into v_projects
      from public.work_tasks t
     where t.id = case when tg_op = 'DELETE' then old.blocked_task_id else new.blocked_task_id end;

  elsif tg_table_name = 'procurement_inquiries' then
    if tg_op = 'UPDATE' then
      if new.status is not distinct from old.status
         and new.project_id is not distinct from old.project_id then
        return null;
      end if;
      v_kind := 'supply';
    end if;
    if tg_op <> 'DELETE' then v_projects := v_projects || new.project_id; end if;
    if tg_op <> 'INSERT' then v_projects := v_projects || old.project_id; end if;

  elsif tg_table_name = 'project_budgets' then
    if tg_op <> 'DELETE' then v_projects := v_projects || new.project_id; end if;
    if tg_op <> 'INSERT' then v_projects := v_projects || old.project_id; end if;

  elsif tg_table_name = 'finance_records' then
    if tg_op = 'UPDATE' and new.amount_cents is not distinct from old.amount_cents
       and new.status is not distinct from old.status
       and new.project_id is not distinct from old.project_id
       and new.record_type is not distinct from old.record_type then
      return null;
    end if;
    if tg_op <> 'DELETE' then v_projects := v_projects || new.project_id; end if;
    if tg_op <> 'INSERT' then v_projects := v_projects || old.project_id; end if;

  else
    return null;
  end if;

  insert into public.project_forecast_signals (project_id, kind)
  select distinct p, v_kind
    from unnest(coalesce(v_projects, '{}'::uuid[])) as p
   where p is not null;
  return null;
end
$$;
revoke all on function public.forecast_note_signal_trg() from public, anon, authenticated;

-- One AFTER ROW trigger per fact table. Argument = the default signal kind.
drop trigger if exists forecast_signal on public.journal_entries;
create trigger forecast_signal after insert or update or delete on public.journal_entries
  for each row execute function public.forecast_note_signal_trg('hours');
drop trigger if exists forecast_signal on public.work_hour_allocations;
create trigger forecast_signal after insert or update or delete on public.work_hour_allocations
  for each row execute function public.forecast_note_signal_trg('hours');
drop trigger if exists forecast_signal on public.work_tasks;
create trigger forecast_signal after insert or update or delete on public.work_tasks
  for each row execute function public.forecast_note_signal_trg('scope');
drop trigger if exists forecast_signal on public.project_stages;
create trigger forecast_signal after insert or update or delete on public.project_stages
  for each row execute function public.forecast_note_signal_trg('scope');
drop trigger if exists forecast_signal on public.projects;
create trigger forecast_signal after update on public.projects
  for each row execute function public.forecast_note_signal_trg('deadline');
drop trigger if exists forecast_signal on public.project_worker_assignments;
create trigger forecast_signal after insert or update or delete on public.project_worker_assignments
  for each row execute function public.forecast_note_signal_trg('team');
drop trigger if exists forecast_signal on public.team_assignments;
create trigger forecast_signal after insert or update or delete on public.team_assignments
  for each row execute function public.forecast_note_signal_trg('team');
drop trigger if exists forecast_signal on public.worker_absences;
create trigger forecast_signal after insert or update or delete on public.worker_absences
  for each row execute function public.forecast_note_signal_trg('availability');
drop trigger if exists forecast_signal on public.work_plan_entries;
create trigger forecast_signal after insert or update or delete on public.work_plan_entries
  for each row execute function public.forecast_note_signal_trg('availability');
drop trigger if exists forecast_signal on public.defects;
create trigger forecast_signal after insert or update or delete on public.defects
  for each row execute function public.forecast_note_signal_trg('quality');
drop trigger if exists forecast_signal on public.defect_corrections;
create trigger forecast_signal after insert or update or delete on public.defect_corrections
  for each row execute function public.forecast_note_signal_trg('quality');
drop trigger if exists forecast_signal on public.task_dependencies;
create trigger forecast_signal after insert or delete on public.task_dependencies
  for each row execute function public.forecast_note_signal_trg('deadline');
drop trigger if exists forecast_signal on public.procurement_inquiries;
create trigger forecast_signal after insert or update or delete on public.procurement_inquiries
  for each row execute function public.forecast_note_signal_trg('orders');
drop trigger if exists forecast_signal on public.project_budgets;
create trigger forecast_signal after insert or update or delete on public.project_budgets
  for each row execute function public.forecast_note_signal_trg('budget');
drop trigger if exists forecast_signal on public.finance_records;
create trigger forecast_signal after insert or update or delete on public.finance_records
  for each row execute function public.forecast_note_signal_trg('budget');

-- ── 6. which projects are due (coarse prefilter; the app decides) ──────────
-- The app's recomputeDecision (lib/forecast/forecast-modes.ts) is the
-- authority on "due"; this returns the CANDIDATES under the same cadence,
-- signalled live projects first, then the longest-unrefreshed. Bounded.
create or replace function public.forecast_due_candidates_v1(p_limit integer default 25)
returns table (
  project_id       uuid,
  organization_id  uuid,
  mode             text,
  enabled          boolean,
  last_computed_at timestamptz,
  last_version     integer,
  last_inputs_hash text,
  first_signal_at  timestamptz,
  last_signal_at   timestamptz,
  max_signal_id    bigint,
  last_forecast    jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with sig as (
    select s.project_id, min(s.noted_at) as first_at, max(s.noted_at) as last_at, max(s.id) as max_id
      from public.project_forecast_signals s
     group by s.project_id
  ),
  base as (
    select p.id, p.organization_id,
           coalesce(st.mode, 'weekly') as mode,
           coalesce(st.enabled, true) as enabled,
           fs.last_computed_at, fs.last_version, fs.last_inputs_hash,
           sig.first_at, sig.last_at, sig.max_id
      from public.projects p
      left join public.organization_forecast_settings st on st.organization_id = p.organization_id
      left join public.project_forecast_state fs on fs.project_id = p.id
      left join sig on sig.project_id = p.id
     where p.status in ('live', 'paused')
       and coalesce(p.record_state, 'active') <> 'duplicate'
       and coalesce(st.enabled, true)
  ),
  clock as (
    select (now() at time zone 'utc') as utc_now
  )
  select b.id, b.organization_id, b.mode, b.enabled, b.last_computed_at, b.last_version,
         b.last_inputs_hash, b.first_at, b.last_at, b.max_id,
         (select f.forecast from public.project_forecasts f
           where f.project_id = b.id and f.version = b.last_version) as last_forecast
    from base b, clock c
   where (b.mode = 'live' and (b.last_computed_at is null or b.max_id is not null
            or (b.last_computed_at at time zone 'utc')::date < c.utc_now::date))
      or (b.mode = 'hourly' and (b.last_computed_at is null
            or date_trunc('hour', b.last_computed_at at time zone 'utc') < date_trunc('hour', c.utc_now)))
      or (b.mode = 'daily' and (b.last_computed_at is null
            or (b.last_computed_at at time zone 'utc')::date < c.utc_now::date))
      or (b.mode = 'weekly' and extract(dow from c.utc_now) = 0 and (b.last_computed_at is null
            or (b.last_computed_at at time zone 'utc')::date < c.utc_now::date))
   order by (b.mode = 'live' and b.max_id is not null) desc,
            b.last_computed_at asc nulls first,
            b.id
   limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;
revoke all on function public.forecast_due_candidates_v1(integer) from public, anon, authenticated;
grant execute on function public.forecast_due_candidates_v1(integer) to service_role;

-- ── 7. the facts door (rows only; every rule stays in the app) ─────────────
create or replace function public.forecast_project_facts_v1(p_project_id uuid, p_today date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c_tasks   constant integer := 2000;
  c_stages  constant integer := 500;
  c_journal constant integer := 3000;
  c_alloc   constant integer := 5000;
  v_project record;
  v_tasks   jsonb;
  v_stages  jsonb;
  v_journal jsonb;
  v_alloc   jsonb;
  v_people  uuid[];
  v_absent  jsonb;
  v_defects jsonb;
  v_failed  integer;
  v_ready   integer;
  v_econ    jsonb;
begin
  select p.id, p.status, p.start_date, p.end_date, p.organization_id
    into v_project
    from public.projects p
   where p.id = p_project_id;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', md5('t:' || t.id::text),
           'parent_key', case when t.parent_task_id is null then null else md5('t:' || t.parent_task_id::text) end,
           'status', t.status,
           'resolved_at', t.resolved_at)), '[]'::jsonb)
    into v_tasks
    from (select * from public.work_tasks where project_id = p_project_id order by created_at, id limit c_tasks + 1) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'status', s.status, 'planned_end', s.planned_end, 'actual_end', s.actual_end)), '[]'::jsonb)
    into v_stages
    from (select * from public.project_stages where project_id = p_project_id order by stage_order, id limit c_stages + 1) s;

  -- Every LIVE entry attributed to this project, in the opaque hours-only
  -- shape of project_team_journal_hour_rows_v1: time/date metrics and the
  -- review rows the confirmation rule reads. Never the entry text.
  select coalesce(jsonb_agg(jsonb_build_object(
           'entry_key', md5('je:' || je.id::text),
           'correction_of_key', case when je.correction_of is null then null else md5('je:' || je.correction_of::text) end,
           'created_at', je.created_at,
           'context_key', md5('ec:' || coalesce(je.engagement_context_id::text, je.worker_id::text)),
           'metrics', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', md5('m:' || m.id::text),
                      'metric_slug', m.metric_slug,
                      'value_numeric', m.value_numeric,
                      'unit_slug', m.unit_slug,
                      'source', m.source,
                      'created_at', m.created_at,
                      'value_text', case
                        when m.metric_slug = 'work_date' and m.value_text ~ '^\s*\d{4}-\d{2}-\d{2}\s*$' then btrim(m.value_text)
                        when m.metric_slug = 'fragment_time' and m.value_text ~ '^\s*\d{1,3}\s*$' then btrim(m.value_text)
                        else null
                      end) order by m.created_at, m.id)
               from public.journal_entry_metrics m
              where m.entry_id = je.id
                and m.metric_slug in ('work_date', 'fragment_time', 'quantity')
           ), '[]'::jsonb),
           'confirmations', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'confirmation_scope', jsonb_strip_nulls(jsonb_build_object(
                        'decision', case when jsonb_typeof(c.confirmation_scope -> 'decision') = 'string' then c.confirmation_scope -> 'decision' end,
                        'action', case when jsonb_typeof(c.confirmation_scope -> 'action') = 'string' then c.confirmation_scope -> 'action' end,
                        'authority', case when jsonb_typeof(c.confirmation_scope -> 'authority' -> 'basis') = 'string'
                                          then jsonb_build_object('basis', c.confirmation_scope -> 'authority' -> 'basis') end)),
                      'created_at', c.created_at,
                      'confirmer_role', c.confirmer_role,
                      'by_subject', (c.confirmer_id is not null and c.confirmer_id = w.profile_id)
                    ) order by c.created_at, c.id)
               from public.journal_entry_confirmations c
              where c.entry_id = je.id
           ), '[]'::jsonb)))
         , '[]'::jsonb)
    into v_journal
    from (
      select e.*
        from public.journal_entries e
       where e.project_id = p_project_id
         and e.deleted_at is null
         and e.superseded_by is null
       order by e.created_at, e.id
       limit c_journal + 1
    ) je
    left join public.workers w on w.id = je.worker_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'worker_key', md5('w:' || a.worker_id::text),
           'work_date', a.work_date,
           'hours', a.hours_numeric,
           'status', a.status)), '[]'::jsonb)
    into v_alloc
    from (
      select h.*
        from public.work_hour_allocations h
        join public.work_objects o on o.id = h.work_object_id
       where o.project_id = p_project_id
         and h.superseded_by is null
       order by h.work_date, h.id
       limit c_alloc + 1
    ) a;

  -- The team now: individually assigned people + members of brigades that
  -- hold an open assignment on the project (team_member_at_v1).
  select coalesce(array_agg(distinct x.profile_id), '{}'::uuid[])
    into v_people
    from (
      select w.profile_id
        from public.project_worker_assignments pwa
        join public.workers w on w.id = pwa.worker_id
       where pwa.project_id = p_project_id and pwa.status = 'active'
      union
      select ec.profile_id
        from public.team_assignments ta
        join public.engagement_contexts ec
          on ec.organization_id = ta.team_org_id and ec.relationship_slug = 'employee'
       where ta.project_id = p_project_id
         and ta.ended_at is null
         and public.team_member_at_v1(ta.team_org_id, ec.profile_id, now())
    ) x
   where x.profile_id is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'person_key', md5('p:' || w.profile_id::text),
           'start_date', a.start_date,
           'end_date', a.end_date,
           'half_day', a.half_day)), '[]'::jsonb)
    into v_absent
    from (
      select wa.*
        from public.worker_absences wa
        join public.workers tw on tw.id = wa.worker_id
       where wa.status = 'approved'
         and wa.end_date > p_today
         and wa.start_date <= p_today + 366
         and tw.profile_id = any (v_people)
       order by wa.start_date, wa.id
       limit 500
    ) a
    join public.workers w on w.id = a.worker_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'severity', d.severity, 'status', d.status, 'due_date', d.due_date)), '[]'::jsonb)
    into v_defects
    from (select * from public.defects where project_id = p_project_id order by created_at, id limit 1000) d;

  select count(*)::integer into v_failed
    from public.defect_corrections dc
    join public.defects d on d.id = dc.defect_id
   where d.project_id = p_project_id
     and dc.outcome = 'failed'
     and d.status not in ('accepted', 'rejected', 'cancelled');

  select count(distinct r.worker_id)::integer into v_ready
    from public.project_worker_readiness_items r
    join public.project_worker_assignments pwa
      on pwa.project_id = r.project_id and pwa.worker_id = r.worker_id and pwa.status = 'active'
   where r.project_id = p_project_id
     and r.status in ('needed', 'missing', 'rejected', 'expired');

  select jsonb_build_object(
           'budget_total_cents', (select sum(b.planned_amount_cents) from public.project_budgets b
                                   where b.project_id = p_project_id and b.category = 'total'),
           'budget_lines_cents', (select sum(b.planned_amount_cents) from public.project_budgets b
                                   where b.project_id = p_project_id and b.category <> 'total'),
           'budget_lines', (select count(*) from public.project_budgets b where b.project_id = p_project_id),
           'actual_cost_cents', coalesce((select sum(f.amount_cents) from public.finance_records f
                                   where f.project_id = p_project_id
                                     and f.record_type in ('expense', 'invoice_received')
                                     and f.status <> 'cancelled'
                                     and f.currency = 'EUR'), 0))
    into v_econ;

  return jsonb_build_object(
    'project', jsonb_build_object('status', v_project.status, 'start_date', v_project.start_date, 'end_date', v_project.end_date),
    'tasks', jsonb_build_object(
      'rows', case when jsonb_array_length(v_tasks) > c_tasks then '[]'::jsonb else v_tasks end,
      'truncated', jsonb_array_length(v_tasks) > c_tasks),
    'stages', jsonb_build_object(
      'rows', case when jsonb_array_length(v_stages) > c_stages then '[]'::jsonb else v_stages end,
      'truncated', jsonb_array_length(v_stages) > c_stages),
    'journal', jsonb_build_object(
      'rows', case when jsonb_array_length(v_journal) > c_journal then v_journal - c_journal else v_journal end,
      'truncated', jsonb_array_length(v_journal) > c_journal),
    'allocations', jsonb_build_object(
      'rows', case when jsonb_array_length(v_alloc) > c_alloc then v_alloc - c_alloc else v_alloc end,
      'truncated', jsonb_array_length(v_alloc) > c_alloc),
    'team', jsonb_build_object('active_people', coalesce(array_length(v_people, 1), 0), 'absences', v_absent),
    'defects', jsonb_build_object('rows', v_defects, 'failed_corrections', v_failed),
    'readiness', jsonb_build_object('workers_with_missing', v_ready),
    'economics', v_econ
  );
end
$$;
revoke all on function public.forecast_project_facts_v1(uuid, date) from public, anon, authenticated;
grant execute on function public.forecast_project_facts_v1(uuid, date) to service_role;

-- ── 8. record a computed forecast (append a version only when it changed) ──
create or replace function public.forecast_record_v1(
  p_project_id         uuid,
  p_mode               text,
  p_reason             text,
  p_computed_at        timestamptz,
  p_as_of              date,
  p_engine_version     text,
  p_inputs_hash        text,
  p_forecast           jsonb,
  p_comparison         jsonb,
  p_facts_summary      jsonb,
  p_store_version      boolean,
  p_consumed_signal_id bigint
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_version integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('forecast:' || p_project_id::text, 0));
  select p.organization_id into v_org from public.projects p where p.id = p_project_id;
  if not found then
    return null;
  end if;

  select coalesce(max(f.version), 0) into v_version
    from public.project_forecasts f where f.project_id = p_project_id;

  if p_store_version or v_version = 0 then
    v_version := v_version + 1;
    insert into public.project_forecasts
      (project_id, organization_id, version, mode, reason, engine_version, computed_at, as_of,
       inputs_hash, forecast, comparison, facts_summary)
    values
      (p_project_id, v_org, v_version, p_mode, p_reason, p_engine_version, p_computed_at, p_as_of,
       p_inputs_hash, p_forecast, p_comparison, coalesce(p_facts_summary, '{}'::jsonb));
  end if;

  insert into public.project_forecast_state as s
    (project_id, last_computed_at, last_version, last_inputs_hash, last_mode)
  values (p_project_id, p_computed_at, v_version, p_inputs_hash, p_mode)
  on conflict (project_id) do update
     set last_computed_at = excluded.last_computed_at,
         last_version     = excluded.last_version,
         last_inputs_hash = excluded.last_inputs_hash,
         last_mode        = excluded.last_mode;

  if p_consumed_signal_id is not null then
    delete from public.project_forecast_signals sg
     where sg.project_id = p_project_id and sg.id <= p_consumed_signal_id;
  end if;

  return v_version;
end
$$;
revoke all on function public.forecast_record_v1(uuid, text, text, timestamptz, date, text, text, jsonb, jsonb, jsonb, boolean, bigint) from public, anon, authenticated;
grant execute on function public.forecast_record_v1(uuid, text, text, timestamptz, date, text, text, jsonb, jsonb, jsonb, boolean, bigint) to service_role;

-- ── 9. set an organization's cadence (admin only, audited) ─────────────────
create or replace function public.forecast_set_mode_v1(
  p_organization_id uuid,
  p_mode            text,
  p_enabled         boolean,
  p_note            text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_prev record;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not coalesce(public.is_admin(), false) then
    raise exception 'Only a platform administrator may change a forecast cadence' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('weekly', 'daily', 'hourly', 'live') then
    raise exception 'invalid mode' using errcode = '22023';
  end if;
  if p_organization_id is null or not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    raise exception 'organization not found' using errcode = '22023';
  end if;

  select s.mode, s.enabled into v_prev
    from public.organization_forecast_settings s
   where s.organization_id = p_organization_id;

  insert into public.organization_forecast_settings as s (organization_id, mode, enabled, note, set_at)
  values (p_organization_id, p_mode, coalesce(p_enabled, true), nullif(btrim(coalesce(p_note, '')), ''), now())
  on conflict (organization_id) do update
     set mode = excluded.mode, enabled = excluded.enabled, note = excluded.note, set_at = excluded.set_at;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'forecast_mode_set', 'organization_forecast_settings', p_organization_id,
          jsonb_build_object(
            'from', jsonb_build_object('mode', coalesce(v_prev.mode, 'weekly'), 'enabled', coalesce(v_prev.enabled, true)),
            'to', jsonb_build_object('mode', p_mode, 'enabled', coalesce(p_enabled, true))));

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'mode', p_mode,
    'enabled', coalesce(p_enabled, true),
    'previous_mode', coalesce(v_prev.mode, 'weekly'),
    'previous_enabled', coalesce(v_prev.enabled, true));
end
$$;
revoke all on function public.forecast_set_mode_v1(uuid, text, boolean, text) from public, anon;
grant execute on function public.forecast_set_mode_v1(uuid, text, boolean, text) to authenticated;

commit;

-- ROLLBACK (see supabase/rollbacks/20261024130000_project_forecasts_v1.down.sql):
--   drop trigger if exists forecast_signal on <each of the 15 tables>;
--   drop function if exists public.forecast_set_mode_v1(uuid, text, boolean, text);
--   drop function if exists public.forecast_record_v1(...);
--   drop function if exists public.forecast_project_facts_v1(uuid, date);
--   drop function if exists public.forecast_due_candidates_v1(integer);
--   drop function if exists public.forecast_note_signal_trg();
--   drop table if exists public.project_forecast_signals, public.project_forecast_state,
--     public.project_forecasts, public.organization_forecast_settings;
