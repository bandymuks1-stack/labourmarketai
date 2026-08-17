-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after the lead session's
-- verification. Never `db push`.
-- Rollback:  supabase/rollbacks/20260817170000_timesheets_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- GRANTs + new RLS-bearing tables + triggers are RED-class; there is no
-- non-RED way to add a row-level-secured, RPC-only-writes domain module).
-- Annotation pre-approved by owner mandate 2026-08-17 (autonomous functional
-- completion train V2, §4 migration authority). SAFETY CLASS: RED — 2 new
-- tables, 7 new functions (5 commands + 1 visibility helper + 1 internal
-- derivation helper), 2 trigger guards, EXECUTE grants. ZERO existing table,
-- policy, grant, trigger or function is modified or recreated. ZERO DML at
-- apply time. Prod apply stays manual by the LEAD session via Supabase MCP.
--
-- 20260817170000 — timesheets v1: DERIVED from the Work Journal, approved
-- through the canonical Workflow & Approval Engine.
--
-- PROBLEM (full reality audit 2026-08-17, WORK section): timesheet is the
-- audit's MISSING row — "zero timesheet/time_entry machinery; only
-- journal_entry_work_items.hours_numeric; exports carry no hours". Workers
-- record real hours in the journal, but no period document exists that an
-- organization can review, approve and export.
--
-- SOLUTION (smallest honest slice — derived, no second hours store):
--   * `timesheets` — ONE period document per worker+org+date-band. The
--     journal stays the ONLY live hours truth; a timesheet's `lines_snapshot`
--     is DERIVED from `journal_entry_work_items` (hours + unit + work type +
--     the entry's project link, placed on the day the work HAPPENED — the
--     entry's own `work_date` metric, falling back to created day).
--     Draft/reopened snapshots recompute on demand; SUBMIT freezes the
--     snapshot (trigger-enforced) and the approval decision happens in the
--     EXISTING Workflow & Approval Engine (context_entity_type='timesheet',
--     context_entity_id=timesheet id) — this module re-implements NOTHING of
--     the engine; the app layer calls the engine's own start RPC.
--   * `timesheet_events` — append-only history (created / refreshed /
--     submitted / approved / rejected / reopened), trigger-immutable like
--     workflow_transitions.
--   * 5 gated SECURITY DEFINER commands are the ONLY write paths (direct
--     insert/update/delete REVOKEd, no write policies): create / refresh /
--     submit / reopen / sync-decision. `sync_timesheet_decision_v1` copies
--     the engine's terminal outcome onto the timesheet — it NEVER decides
--     anything itself and cannot be used to approve.
--
-- PERIOD RULES: period_end >= period_start; at most 31 calendar days
-- (inclusive); NO overlap per worker+org against ANY existing timesheet
-- (race-guarded by a per-worker+org advisory transaction lock inside the
-- create command — proven by scripts/db-proof/timesheets-v1.sh).
--
-- WHAT IS DELIBERATELY NOT ADDED (binding):
--   - NO payroll, NO pay rates, NO overtime rules, NO shift/roster entity;
--   - NO second hours store — lines are a frozen COPY of journal-derived
--     rows, never an editable surface; correcting hours happens in the
--     journal and then refresh/resubmit;
--   - NO new notification types (the engine's workflow_step_pending /
--     workflow_decided already cover the approval flow);
--   - NO day→hour conversion invention: 'days'-unit lines are totalled as
--     day units, never multiplied by an invented workday length;
--   - NO scheduler, NO AI, NO external sending of any kind;
--   - NO recreate of ANY existing object — every name below is NEW.
--
-- RLS DECISION, STATED EXPLICITLY:
--   anon:           NOTHING. No grant, no policy.
--   authenticated:  SELECT only, fail-closed —
--     timesheets: the worker themselves (owns_worker), the org's managers
--       over BOTH membership truths (public.manages_organization — active
--       managing membership OR managing engagement context), or platform
--       admin;
--     timesheet_events: same audience via ONE definer predicate
--       (timesheet_can_view_v1 — assets/workflow recursion-free precedent).
--     Writes: NO insert/update/delete policy on either table and an explicit
--       REVOKE — the 5 gated commands are the only write paths.
--   service_role:   untouched default (no module-specific widening).
--
-- ROLLBACK: supabase/rollbacks/20260817170000_timesheets_v1.down.sql drops
-- ONLY the 2 triggers, 7 new functions and 2 new tables (feature-created
-- rows live ONLY in those tables). No existing object was touched, so the
-- down file recreates nothing.
-- ============================================================================

begin;

-- ── 0. Safety assertions — the truths this module builds on must exist ──────
do $$
begin
  if to_regclass('public.workers') is null then
    raise exception 'workers missing — this environment predates the worker spine';
  end if;
  if to_regclass('public.journal_entry_work_items') is null then
    raise exception 'journal_entry_work_items missing — apply 20260601090000 before this migration';
  end if;
  if to_regclass('public.journal_entry_metrics') is null then
    raise exception 'journal_entry_metrics missing — apply 0013 before this migration';
  end if;
  if to_regclass('public.workflow_instances') is null then
    raise exception 'workflow_instances missing — apply 20260817130000 (workflow engine v1) before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'manages_organization'
  ) then
    raise exception 'manages_organization missing — apply 0013/20260806180000 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'owns_worker'
  ) then
    raise exception 'owns_worker missing — apply 0001 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'belongs_to_organization'
  ) then
    raise exception 'belongs_to_organization missing — apply 20260806120000 before this migration';
  end if;
end $$;

-- ── 1. Tables ───────────────────────────────────────────────────────────────

-- 1a. The period document. Hours live ONLY in lines_snapshot (frozen at
-- submit); the journal remains the live truth.
create table if not exists public.timesheets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id       uuid not null references public.workers(id) on delete cascade,
  period_start    date not null,
  period_end      date not null,
  status          text not null default 'draft'
                    check (status in ('draft','submitted','approved','rejected','reopened')),
  submitted_at    timestamptz,
  decided_at      timestamptz,
  -- Derived lines + totals, bounded. Shape (single contract with the TS
  -- model): { computedAt, periodStart, periodEnd, lines: [...], totals:
  -- { totalHours, totalDayUnits, lineCount } }.
  lines_snapshot  jsonb not null default '{}'::jsonb
                    check (pg_column_size(lines_snapshot) <= 65536),
  created_by      uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint timesheets_period_sane check (
    period_end >= period_start
    and period_end - period_start <= 30  -- at most 31 inclusive days
  ),
  constraint timesheets_status_shape check (
    (status = 'draft'     and submitted_at is null     and decided_at is null)
    or
    (status = 'submitted' and submitted_at is not null and decided_at is null)
    or
    (status in ('approved','rejected')
                          and submitted_at is not null and decided_at is not null)
    or
    (status = 'reopened'  and submitted_at is not null and decided_at is null)
  )
);
create index if not exists timesheets_worker_idx
  on public.timesheets (worker_id, period_start desc);
create index if not exists timesheets_org_status_idx
  on public.timesheets (organization_id, status);

comment on table public.timesheets is
  'Period hour documents DERIVED from the Work Journal (journal_entry_work_items). The journal is the only live hours truth; lines_snapshot freezes at submit. Approval runs on the canonical Workflow & Approval Engine (context_entity_type=timesheet).';

-- 1b. Append-only lifecycle history.
create table if not exists public.timesheet_events (
  id               uuid primary key default gen_random_uuid(),
  timesheet_id     uuid not null references public.timesheets(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id),
  action           text not null check (action in (
                     'created','refreshed','submitted','approved','rejected','reopened')),
  note             text check (char_length(note) <= 500),
  created_at       timestamptz not null default now()
);
create index if not exists timesheet_events_timesheet_idx
  on public.timesheet_events (timesheet_id, created_at);

comment on table public.timesheet_events is
  'APPEND-ONLY timesheet history. Rows are immutable (trigger-enforced for every role incl. service_role).';

-- ── 2. Immutability trigger guards ──────────────────────────────────────────

-- 2a. Events are append-only forever.
create or replace function public.timesheet_events_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'timesheet_events is append-only: % is not allowed', tg_op;
end;
$$;
drop trigger if exists timesheet_events_append_only on public.timesheet_events;
create trigger timesheet_events_append_only
  before update or delete on public.timesheet_events
  for each row execute function public.timesheet_events_guard();

-- 2b. Identity is immutable; a SUBMITTED/DECIDED snapshot is frozen. The
-- commands below are the only writers, but the guard holds even against a
-- direct write by a privileged role (workflow fill-once precedent).
create or replace function public.timesheets_frozen_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.worker_id is distinct from old.worker_id
    or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end
    or new.created_by is distinct from old.created_by
  then
    raise exception 'timesheet identity (org, worker, period) is immutable';
  end if;
  if old.status in ('submitted','approved','rejected')
     and new.lines_snapshot::text is distinct from old.lines_snapshot::text
  then
    raise exception 'a submitted timesheet snapshot is frozen — reopen first';
  end if;
  return new;
end;
$$;
drop trigger if exists timesheets_frozen on public.timesheets;
create trigger timesheets_frozen
  before update on public.timesheets
  for each row execute function public.timesheets_frozen_guard();

-- ── 3. Visibility + derivation helpers (SECURITY DEFINER) ───────────────────

-- 3a. THE timesheet visibility predicate: the worker themselves, the org's
-- managers (both membership truths via manages_organization), or platform
-- admin. Definer, so the events policy needs no policy-time join.
create or replace function public.timesheet_can_view_v1(p_timesheet_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.timesheets t
     where t.id = p_timesheet_id
       and (
         public.owns_worker(t.worker_id)
         or public.manages_organization(t.organization_id)
         or public.is_admin()
       )
  )
$$;
revoke all on function public.timesheet_can_view_v1(uuid) from public;
revoke all on function public.timesheet_can_view_v1(uuid) from anon;
grant execute on function public.timesheet_can_view_v1(uuid) to authenticated;

-- 3b. INTERNAL derivation (no grants at all — SQL-internal, the
-- membership_actor_role_v1 precedent). ONE derivation truth used by
-- create/refresh/submit alike:
--   * lines come ONLY from journal_entry_work_items of this worker,
--     denormalised to THIS organization, with recorded hours, not rejected;
--   * the parent entry must be live (not deleted, not superseded) and not
--     replaced by a live correction (calendar-projection precedent);
--   * the day is the day the work HAPPENED: the entry's own `work_date`
--     metric when it is a valid ISO day, else the entry's created UTC day;
--   * units are NEVER converted by invention: hours stay hours, minutes
--     divide by 60, 'days' lines are totalled separately as day units;
--   * deterministic order (day, then id), bounded to 500 lines.
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
revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from public;
revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from anon;
revoke all on function public.timesheet_compute_lines_v1(uuid, uuid, date, date) from authenticated;

-- ── 4. RLS — SELECT-only, fail-closed; writes stay RPC-only ────────────────

alter table public.timesheets enable row level security;
alter table public.timesheet_events enable row level security;

revoke all on public.timesheets, public.timesheet_events from public;
revoke all on public.timesheets, public.timesheet_events from anon;
revoke all on public.timesheets, public.timesheet_events from authenticated;
grant select on public.timesheets, public.timesheet_events to authenticated;

drop policy if exists timesheets_select on public.timesheets;
create policy timesheets_select on public.timesheets
  for select to authenticated
  using (
    public.owns_worker(worker_id)
    or public.manages_organization(organization_id)
    or public.is_admin()
  );

drop policy if exists timesheet_events_select on public.timesheet_events;
create policy timesheet_events_select on public.timesheet_events
  for select to authenticated
  using (public.timesheet_can_view_v1(timesheet_id));

-- No insert/update/delete policy anywhere: with the explicit REVOKE above,
-- the commands below are the ONLY write paths.

-- ── 5. Commands (SECURITY DEFINER, outcome-string contract) ────────────────

-- 5a. create_timesheet_v1 — the worker opens a period document for one of
-- their organizations. Returns the new timesheet id (uuid-as-text) on
-- success; a short outcome string otherwise (TS layer distinguishes by UUID
-- shape — the start_workflow_instance_v1 precedent).
create or replace function public.create_timesheet_v1(
  p_organization_id text,
  p_period_start    text,
  p_period_end      text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_org    uuid;
  v_start  date;
  v_end    date;
  v_worker uuid;
  v_id     uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  begin
    v_org := nullif(trim(coalesce(p_organization_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_org is null then return 'invalid'; end if;

  if coalesce(trim(p_period_start), '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(trim(p_period_end), '') !~ '^\d{4}-\d{2}-\d{2}$' then
    return 'invalid';
  end if;
  begin
    v_start := trim(p_period_start)::date;
    v_end   := trim(p_period_end)::date;
  exception when others then
    return 'invalid';
  end;
  if v_end < v_start or v_end - v_start > 30 then
    return 'invalid_period';
  end if;

  select w.id into v_worker from public.workers w where w.profile_id = uid;
  if v_worker is null then return 'no_worker'; end if;

  -- Org boundary over BOTH membership truths. Merged with "org missing" —
  -- no oracle.
  if not (public.belongs_to_organization(v_org) or public.is_admin()) then
    return 'not_found';
  end if;

  -- Abuse cap: open (draft/reopened) documents per worker+org.
  if (select count(*) from public.timesheets t
       where t.worker_id = v_worker and t.organization_id = v_org
         and t.status in ('draft','reopened')) >= 20 then
    return 'limit_reached';
  end if;

  -- Serialize concurrent creates for the same worker+org, then reject ANY
  -- period overlap (inclusive bands, the booking accept-guard semantics).
  perform pg_advisory_xact_lock(
    hashtextextended('timesheets:' || v_worker::text || ':' || v_org::text, 0));
  if exists (
    select 1 from public.timesheets t
     where t.worker_id = v_worker
       and t.organization_id = v_org
       and daterange(t.period_start, t.period_end, '[]')
           && daterange(v_start, v_end, '[]')
  ) then
    return 'overlap';
  end if;

  insert into public.timesheets
    (organization_id, worker_id, period_start, period_end, status,
     lines_snapshot, created_by)
  values
    (v_org, v_worker, v_start, v_end, 'draft',
     public.timesheet_compute_lines_v1(v_worker, v_org, v_start, v_end), uid)
  returning id into v_id;

  insert into public.timesheet_events (timesheet_id, actor_profile_id, action)
  values (v_id, uid, 'created');

  return v_id::text;
end;
$$;
revoke all on function public.create_timesheet_v1(text, text, text) from public;
revoke all on function public.create_timesheet_v1(text, text, text) from anon;
grant execute on function public.create_timesheet_v1(text, text, text) to authenticated;

-- 5b. refresh_timesheet_lines_v1 — recompute a DRAFT/REOPENED snapshot from
-- the live journal. The worker's own document only.
create or replace function public.refresh_timesheet_lines_v1(
  p_timesheet_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  v_id uuid;
  v_ts record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_timesheet_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select t.id, t.worker_id, t.organization_id, t.period_start, t.period_end, t.status
    into v_ts
    from public.timesheets t
   where t.id = v_id
   for update;
  -- Merged: missing row and someone else's document answer the same.
  if v_ts.id is null or not public.owns_worker(v_ts.worker_id) then
    return 'not_found';
  end if;
  if v_ts.status not in ('draft','reopened') then return 'not_editable'; end if;

  update public.timesheets
     set lines_snapshot = public.timesheet_compute_lines_v1(
           v_ts.worker_id, v_ts.organization_id, v_ts.period_start, v_ts.period_end),
         updated_at = now()
   where id = v_ts.id;

  insert into public.timesheet_events (timesheet_id, actor_profile_id, action)
  values (v_ts.id, uid, 'refreshed');

  return 'refreshed';
end;
$$;
revoke all on function public.refresh_timesheet_lines_v1(text) from public;
revoke all on function public.refresh_timesheet_lines_v1(text) from anon;
grant execute on function public.refresh_timesheet_lines_v1(text) to authenticated;

-- 5c. submit_timesheet_v1 — recompute one last time, FREEZE the snapshot and
-- hand the document to the approval flow. The engine instance itself is
-- started by the app layer through the engine's own start RPC
-- (context_entity_type='timesheet', context_entity_id=this id) — this
-- command never re-implements the engine.
create or replace function public.submit_timesheet_v1(
  p_timesheet_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  v_id uuid;
  v_ts record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_timesheet_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select t.id, t.worker_id, t.organization_id, t.period_start, t.period_end, t.status
    into v_ts
    from public.timesheets t
   where t.id = v_id
   for update;
  if v_ts.id is null or not public.owns_worker(v_ts.worker_id) then
    return 'not_found';
  end if;
  if v_ts.status = 'submitted' then return 'already_submitted'; end if;
  if v_ts.status not in ('draft','reopened') then return 'not_editable'; end if;

  update public.timesheets
     set lines_snapshot = public.timesheet_compute_lines_v1(
           v_ts.worker_id, v_ts.organization_id, v_ts.period_start, v_ts.period_end),
         status = 'submitted',
         submitted_at = now(),
         decided_at = null,
         updated_at = now()
   where id = v_ts.id;

  insert into public.timesheet_events (timesheet_id, actor_profile_id, action)
  values (v_ts.id, uid, 'submitted');

  return 'submitted';
end;
$$;
revoke all on function public.submit_timesheet_v1(text) from public;
revoke all on function public.submit_timesheet_v1(text) from anon;
grant execute on function public.submit_timesheet_v1(text) to authenticated;

-- 5d. reopen_timesheet_v1 — an org manager sends a DECIDED document back to
-- the worker (history note REQUIRED). Reopening clears the decision stamp;
-- the frozen snapshot becomes editable again only through refresh/submit.
create or replace function public.reopen_timesheet_v1(
  p_timesheet_id text,
  p_note         text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_id   uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_ts   record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_timesheet_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;
  if v_note is null or char_length(v_note) < 3 or char_length(v_note) > 500 then
    return 'invalid';
  end if;

  select t.id, t.organization_id, t.status
    into v_ts
    from public.timesheets t
   where t.id = v_id
   for update;
  -- Merged: missing row and no authority answer the same — no oracle.
  if v_ts.id is null
     or not (public.manages_organization(v_ts.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_ts.status not in ('approved','rejected') then return 'not_decided'; end if;

  update public.timesheets
     set status = 'reopened',
         decided_at = null,
         updated_at = now()
   where id = v_ts.id;

  insert into public.timesheet_events (timesheet_id, actor_profile_id, action, note)
  values (v_ts.id, uid, 'reopened', v_note);

  return 'reopened';
end;
$$;
revoke all on function public.reopen_timesheet_v1(text, text) from public;
revoke all on function public.reopen_timesheet_v1(text, text) from anon;
grant execute on function public.reopen_timesheet_v1(text, text) to authenticated;

-- 5e. sync_timesheet_decision_v1 — copy the engine's TERMINAL outcome onto a
-- SUBMITTED timesheet. This command NEVER decides anything: the decision was
-- made in the engine by its resolved approvers; this only reflects it.
--   engine approved            -> timesheet approved
--   engine rejected            -> timesheet rejected
--   engine withdrawn/cancelled -> timesheet reopened (back to the worker)
--   engine still pending       -> 'still_pending' (no write)
--   no engine instance         -> 'no_instance'   (no write)
-- Callable by anyone who may VIEW the document (worker, org manager, admin).
create or replace function public.sync_timesheet_decision_v1(
  p_timesheet_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_id   uuid;
  v_ts   record;
  v_wf   record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_timesheet_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select t.id, t.worker_id, t.organization_id, t.status
    into v_ts
    from public.timesheets t
   where t.id = v_id
   for update;
  if v_ts.id is null
     or not (public.owns_worker(v_ts.worker_id)
             or public.manages_organization(v_ts.organization_id)
             or public.is_admin()) then
    return 'not_found';
  end if;
  if v_ts.status <> 'submitted' then return 'not_submitted'; end if;

  select i.status into v_wf
    from public.workflow_instances i
   where i.context_entity_type = 'timesheet'
     and i.context_entity_id = v_ts.id
   order by i.created_at desc
   limit 1;
  if v_wf.status is null then return 'no_instance'; end if;
  if v_wf.status = 'pending' then return 'still_pending'; end if;

  if v_wf.status = 'approved' then
    update public.timesheets
       set status = 'approved', decided_at = now(), updated_at = now()
     where id = v_ts.id;
    insert into public.timesheet_events (timesheet_id, actor_profile_id, action)
    values (v_ts.id, uid, 'approved');
    return 'approved';
  end if;

  if v_wf.status = 'rejected' then
    update public.timesheets
       set status = 'rejected', decided_at = now(), updated_at = now()
     where id = v_ts.id;
    insert into public.timesheet_events (timesheet_id, actor_profile_id, action)
    values (v_ts.id, uid, 'rejected');
    return 'rejected';
  end if;

  -- withdrawn / cancelled — the request went away; the document returns to
  -- the worker as reopened (never silently approved).
  update public.timesheets
     set status = 'reopened', decided_at = null, updated_at = now()
   where id = v_ts.id;
  insert into public.timesheet_events (timesheet_id, actor_profile_id, action, note)
  values (v_ts.id, uid, 'reopened', 'workflow ' || v_wf.status);
  return 'reopened';
end;
$$;
revoke all on function public.sync_timesheet_decision_v1(text) from public;
revoke all on function public.sync_timesheet_decision_v1(text) from anon;
grant execute on function public.sync_timesheet_decision_v1(text) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260817170000_timesheets_v1.down.sql
-- restores the prior state exactly (drops the 2 triggers, 7 new functions
-- and 2 new tables; feature-created rows live only in those tables).
