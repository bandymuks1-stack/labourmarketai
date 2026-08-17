-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after the lead session's
-- verification. Never `db push`. APPLY ORDER: AFTER the workflow engine pair
-- (20260817130000 + 20260817130100) — this module CONSUMES the engine.
-- Rollback: supabase/rollbacks/20260817180000_employee_requests_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- GRANTs + a new RLS-bearing table are RED-class; there is no non-RED way to
-- add a row-level-secured, RPC-only-writable domain table). Annotation
-- pre-approved by owner mandate 2026-08-17 (autonomous functional completion
-- train V2, §4 migration authority). SAFETY CLASS: RED — 1 new table, 3 new
-- SECURITY DEFINER functions, EXECUTE grants. ZERO existing table, policy,
-- grant, trigger or function is modified or recreated. ZERO triggers — the
-- engine tables are consumed ONLY through their public commands. ZERO DML at
-- apply time. Prod apply stays manual by the LEAD session via Supabase MCP.
--
-- 20260817180000 — typed employee requests ON the workflow engine, v1.
--
-- PROBLEM: the product has NO generic employee→employer request entity
-- (full-reality audit 2026-08-17, EMPLOYEE LIFECYCLE: "employee requests
-- MISSING"). Remote-work, schedule-change, certificate, condition-change,
-- benefit and equipment asks happen off-platform. The canonical Workflow &
-- Approval Engine v1 (20260817130000) now exists exactly for this — its
-- definition vocabulary already names context_entity_type='generic_request'.
--
-- SOLUTION (smallest honest slice, NO per-type approval tables):
--   * ONE typed register table `employee_requests` — the WHAT (type, title,
--     details, optional date range) plus a cheap status MIRROR;
--   * the approval lifecycle itself runs on the ENGINE: create starts a
--     workflow instance (context_entity_type='generic_request',
--     context_entity_id=request id) through the engine's OWN public command
--     `start_workflow_instance_v1` in the SAME transaction — approve/reject/
--     delegate/escalate stay 100% engine behaviour, decided in the existing
--     approvals inbox;
--   * the mirror status is DERIVED truth: the engine instance decides; the
--     mirror is kept in sync inside the same RPC transaction where this
--     module acts (create/withdraw) and by READ-REPAIR
--     (`sync_employee_request_status_v1`) after engine-side completions.
--     NO trigger is placed on any engine table — the engine belongs to its
--     own train and is consumed strictly through its command/read contract.
--   * request_type is a CLOSED vocabulary that deliberately EXCLUDES
--     absence/leave: the proven worker_absences path
--     (20260718150000_leave_absence.sql) stays the one and only leave flow.
--
-- WHAT IS DELIBERATELY NOT ADDED (binding):
--   - NO absence/leave request type here — worker_absences stays canonical
--     and untouched;
--   - NO per-type approval tables, NO second approval engine;
--   - NO triggers on workflow_* tables (another train's engine);
--   - NO new notification event types — the engine's four workflow types
--     (20260817130100) already cover request approvals;
--   - NO payroll, NO auto-approval, NO AI, NO external sending;
--   - NO calendar projection change (Train E owns the calendar; the
--     documented seam lives in the PR body).
--
-- RLS DECISION, STATED EXPLICITLY:
--   anon:           NOTHING. No grant, no policy.
--   authenticated:  SELECT only, fail-closed — the requester themselves
--     (requester_profile_id = auth.uid()), the org's managing roles
--     (public.has_org_demand_access: ACTIVE owner/admin/manager/
--     external_manager membership — the requests register audience), or
--     platform admin. Plain members do NOT see colleagues' requests.
--   Writes: NO insert/update/delete policy and an explicit REVOKE — the
--     three gated commands below are the only write paths.
--   service_role:   untouched default (no module-specific widening).
--
-- ROLLBACK: supabase/rollbacks/20260817180000_employee_requests_v1.down.sql
-- restores the prior state exactly: drops ONLY the 3 new functions and the
-- 1 new table (feature-created rows live only there; engine instances
-- started by it live in engine tables and are governed by the engine).
-- ============================================================================

begin;

-- ── 0. Safety assertions — the truths this module builds on must exist ─────
do $$
begin
  if to_regclass('public.workflow_instances') is null then
    raise exception 'workflow_instances missing — apply 20260817130000_workflow_engine_v1 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'start_workflow_instance_v1'
  ) then
    raise exception 'start_workflow_instance_v1 missing — apply 20260817130000_workflow_engine_v1 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'withdraw_workflow_instance_v1'
  ) then
    raise exception 'withdraw_workflow_instance_v1 missing — apply 20260817130000_workflow_engine_v1 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'belongs_to_organization'
  ) then
    raise exception 'belongs_to_organization missing — apply 20260806120000 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'has_org_demand_access'
  ) then
    raise exception 'has_org_demand_access missing — apply 20260806200000 before this migration';
  end if;
end $$;

-- ── 1. Table — the typed request register with a status mirror ─────────────
-- The engine instance is the truth for the lifecycle; `status` here is a
-- cheap listing mirror kept in sync by the commands below + read-repair.
create table if not exists public.employee_requests (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  requester_profile_id uuid not null references public.profiles(id) on delete cascade,
  request_type         text not null check (request_type in (
                         'remote_work','schedule_change','certificate_request',
                         'employment_condition_change','benefit_request',
                         'equipment_request','other')),
  title                text not null check (char_length(trim(title)) >= 3 and char_length(title) <= 160),
  details              text check (char_length(details) <= 2000),
  date_from            date,
  date_to              date,
  status               text not null default 'pending' check (status in (
                         'pending','approved','rejected','withdrawn','cancelled')),
  workflow_instance_id uuid references public.workflow_instances(id) on delete set null,
  created_at           timestamptz not null default now(),
  constraint employee_requests_dates_shape check (
    (date_from is null and date_to is null)
    or (date_from is not null and (date_to is null or date_to >= date_from))
  )
);
create index if not exists employee_requests_org_status_idx
  on public.employee_requests (organization_id, status);
create index if not exists employee_requests_requester_idx
  on public.employee_requests (requester_profile_id, created_at desc);
create index if not exists employee_requests_instance_idx
  on public.employee_requests (workflow_instance_id);

comment on table public.employee_requests is
  'Typed employee->employer requests. The approval lifecycle runs on the canonical workflow engine (context_entity_type=generic_request); status here is a listing mirror of the engine instance, engine truth wins. Absence/leave requests are NOT in this vocabulary - worker_absences stays the canonical leave path.';

-- ── 2. RLS — SELECT-only, fail-closed; writes stay RPC-only ────────────────
alter table public.employee_requests enable row level security;

revoke all on public.employee_requests from public;
revoke all on public.employee_requests from anon;
revoke all on public.employee_requests from authenticated;
grant select on public.employee_requests to authenticated;

drop policy if exists employee_requests_select on public.employee_requests;
create policy employee_requests_select on public.employee_requests
  for select to authenticated
  using (
    requester_profile_id = auth.uid()
    or public.has_org_demand_access(organization_id)
    or public.is_admin()
  );

-- No insert/update/delete policy anywhere: with the explicit REVOKE above,
-- the commands below are the ONLY write paths.

-- ── 3. create_employee_request_v1 — file a typed request ON the engine ─────
-- Validates, inserts the register row, then starts the engine instance
-- through the engine's OWN public command in the same transaction (mirror +
-- instance are created atomically). Requester must be an active member of
-- the organization over BOTH membership truths (belongs_to_organization).
-- Definition resolution convention (org owner/admin authors these through
-- the existing engine commands / the seed helper):
--   slug 'employee_request_<type>'  — per-type default, preferred;
--   slug 'employee_request_default' — org-wide fallback.
-- Both must be active + context_entity_type='generic_request'.
-- Returns the STARTED ENGINE INSTANCE id (uuid-as-text) on success; a short
-- outcome string otherwise. The TS layer distinguishes by UUID shape.
create or replace function public.create_employee_request_v1(
  p_organization_id text,
  p_request_type    text,
  p_title           text,
  p_details         text default null,
  p_date_from       text default null,
  p_date_to         text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_org     uuid;
  v_type    text := nullif(trim(coalesce(p_request_type, '')), '');
  v_title   text := nullif(trim(coalesce(p_title, '')), '');
  v_details text := nullif(trim(coalesce(p_details, '')), '');
  v_from    date;
  v_to      date;
  v_def     uuid;
  v_req     uuid;
  v_out     text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  begin
    v_org  := nullif(trim(coalesce(p_organization_id, '')), '')::uuid;
    v_from := nullif(trim(coalesce(p_date_from, '')), '')::date;
    v_to   := nullif(trim(coalesce(p_date_to, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return 'invalid';
  end;
  if v_org is null then return 'invalid'; end if;

  if v_type is null or v_type not in (
    'remote_work','schedule_change','certificate_request',
    'employment_condition_change','benefit_request','equipment_request','other') then
    return 'invalid';
  end if;
  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 160 then
    return 'invalid';
  end if;
  if v_details is not null and char_length(v_details) > 2000 then
    return 'invalid';
  end if;
  if v_to is not null and v_from is null then return 'invalid'; end if;
  if v_from is not null and v_to is not null and v_to < v_from then
    return 'invalid';
  end if;

  -- Merged outcome for "org missing" and "not a member" — no oracle.
  if not (public.belongs_to_organization(v_org) or public.is_admin()) then
    return 'not_found';
  end if;

  -- Abuse cap: open requests per requester in this module (the engine holds
  -- its own global cap of 100 pending instances per requester).
  if (select count(*) from public.employee_requests r
       where r.requester_profile_id = uid and r.status = 'pending') >= 50 then
    return 'limit_reached';
  end if;

  -- Per-type default definition, then org-wide fallback. Honest degradation:
  -- no published definition -> 'no_definition' / 'not_published', never a
  -- silently auto-approved request.
  select d.id into v_def
    from public.workflow_definitions d
   where d.organization_id = v_org
     and d.is_active
     and d.context_entity_type = 'generic_request'
     and d.slug = 'employee_request_' || v_type
   limit 1;
  if v_def is null then
    select d.id into v_def
      from public.workflow_definitions d
     where d.organization_id = v_org
       and d.is_active
       and d.context_entity_type = 'generic_request'
       and d.slug = 'employee_request_default'
     limit 1;
  end if;
  if v_def is null then return 'no_definition'; end if;

  insert into public.employee_requests
    (organization_id, requester_profile_id, request_type, title, details,
     date_from, date_to, status)
  values
    (v_org, uid, v_type, v_title, v_details, v_from, v_to, 'pending')
  returning id into v_req;

  -- ENGINE CONSUMPTION CONTRACT: only the engine's own public command, in
  -- the same transaction. Payload stays small and typed; details live on
  -- the register row.
  v_out := public.start_workflow_instance_v1(
    v_def::text,
    v_title,
    jsonb_strip_nulls(jsonb_build_object(
      'employee_request_id', v_req::text,
      'request_type', v_type,
      'date_from', v_from::text,
      'date_to', v_to::text
    )),
    v_req::text
  );

  if v_out !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    -- The engine refused ('not_published', 'no_approvers', 'limit_reached',
    -- ...): keep the register clean — same-transaction removal of the row
    -- that never became a request.
    delete from public.employee_requests where id = v_req;
    return v_out;
  end if;

  update public.employee_requests
     set workflow_instance_id = v_out::uuid
   where id = v_req;

  return v_out;
end;
$$;
revoke all on function public.create_employee_request_v1(text, text, text, text, text, text) from public;
revoke all on function public.create_employee_request_v1(text, text, text, text, text, text) from anon;
grant execute on function public.create_employee_request_v1(text, text, text, text, text, text) to authenticated;

-- ── 4. withdraw_employee_request_v1 — the requester takes it back ──────────
-- Withdraws via the ENGINE command and mirrors the outcome in the same
-- transaction. If the engine instance already completed, the mirror is
-- repaired to the engine truth instead (read-repair semantics).
create or replace function public.withdraw_employee_request_v1(
  p_request_id text,
  p_reason     text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_req_id uuid;
  v_row    record;
  v_out    text;
  v_truth  text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_req_id := nullif(trim(coalesce(p_request_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_req_id is null then return 'invalid'; end if;

  select r.id, r.status, r.requester_profile_id, r.workflow_instance_id
    into v_row
    from public.employee_requests r
   where r.id = v_req_id
   for update;
  -- Merged: missing row and someone else's request answer the same.
  if v_row.id is null or v_row.requester_profile_id <> uid then
    return 'not_found';
  end if;
  if v_row.status <> 'pending' then return 'not_pending'; end if;

  if v_row.workflow_instance_id is null then
    -- Defensive: a mirror row without an instance can only mean an engine
    -- rollback happened underneath; the requester may still close it out.
    update public.employee_requests set status = 'withdrawn' where id = v_row.id;
    return 'withdrawn';
  end if;

  v_out := public.withdraw_workflow_instance_v1(
    v_row.workflow_instance_id::text, p_reason);

  if v_out = 'withdrawn' then
    update public.employee_requests set status = 'withdrawn' where id = v_row.id;
    return 'withdrawn';
  end if;

  if v_out = 'not_pending' then
    -- The engine already completed this instance: repair the mirror to the
    -- engine truth and answer honestly.
    select i.status into v_truth
      from public.workflow_instances i
     where i.id = v_row.workflow_instance_id;
    if v_truth is not null and v_truth <> v_row.status
       and v_truth in ('pending','approved','rejected','withdrawn','cancelled') then
      update public.employee_requests set status = v_truth where id = v_row.id;
    end if;
    return 'not_pending';
  end if;

  return v_out;
end;
$$;
revoke all on function public.withdraw_employee_request_v1(text, text) from public;
revoke all on function public.withdraw_employee_request_v1(text, text) from anon;
grant execute on function public.withdraw_employee_request_v1(text, text) to authenticated;

-- ── 5. sync_employee_request_status_v1 — read-repair to engine truth ───────
-- Engine-side completions (approve/reject in the approvals inbox, org
-- cancel) do NOT touch this table — by design there is no trigger on engine
-- tables. The read layer calls this when it notices mirror != engine; the
-- copy direction is ALWAYS engine -> mirror.
create or replace function public.sync_employee_request_status_v1(
  p_request_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_req_id uuid;
  v_row    record;
  v_truth  text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_req_id := nullif(trim(coalesce(p_request_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_req_id is null then return 'invalid'; end if;

  select r.id, r.status, r.requester_profile_id, r.organization_id,
         r.workflow_instance_id
    into v_row
    from public.employee_requests r
   where r.id = v_req_id
   for update;
  -- Same visibility as the SELECT policy; merged answers — no oracle.
  if v_row.id is null
     or not (v_row.requester_profile_id = uid
             or public.has_org_demand_access(v_row.organization_id)
             or public.is_admin()) then
    return 'not_found';
  end if;

  if v_row.workflow_instance_id is null then return 'no_instance'; end if;

  select i.status into v_truth
    from public.workflow_instances i
   where i.id = v_row.workflow_instance_id;
  if v_truth is null then return 'no_instance'; end if;
  if v_truth not in ('pending','approved','rejected','withdrawn','cancelled') then
    return 'no_instance';
  end if;

  if v_truth = v_row.status then return 'unchanged'; end if;

  update public.employee_requests set status = v_truth where id = v_row.id;
  return 'synced';
end;
$$;
revoke all on function public.sync_employee_request_status_v1(text) from public;
revoke all on function public.sync_employee_request_status_v1(text) from anon;
grant execute on function public.sync_employee_request_status_v1(text) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260817180000_employee_requests_v1.down.sql
-- drops ONLY the 3 new functions and the employee_requests table. Engine
-- instances started through this module remain governed by the engine.
