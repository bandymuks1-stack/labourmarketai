-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration by the LEAD session after
-- review. Never `db push`.
-- Rollback:  supabase/rollbacks/20260817222000_business_trips_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- GRANTs + new RLS-bearing tables + a trigger guard are RED-class; there is
-- no non-RED way to add a row-level-secured, RPC-only-writes domain module).
-- Annotation pre-approved by owner mandate 2026-08-17 (autonomous functional
-- completion train V2, §4 migration authority). SAFETY CLASS: RED — 2 new
-- tables, 8 new functions (7 commands + 1 visibility helper), 1 trigger
-- guard, 1 additive nullable column on finance_records (+ its index),
-- EXECUTE grants. ZERO existing table, policy, grant, trigger or function is
-- modified or recreated. ZERO DML at apply time. Prod apply stays manual by
-- the LEAD session via Supabase MCP.
--
-- 20260817222000 — business trips v1 (train J, financial ops P2).
--
-- PROBLEM (full reality audit 2026-08-17, OPERATIONS): business trips are
-- the audit's MISSING row — "zero machinery". A person travelling for the
-- organization has no way to request the trip, no approval trail, and trip
-- expenses cannot be grouped anywhere.
--
-- SOLUTION (smallest honest slice — a thin module on existing engines):
--   * business_trips — ONE bounded request row: traveler (the requester
--     themselves in v1), destination, inclusive date band, purpose, optional
--     project link, optional advance amount (integer cents, METADATA ONLY —
--     recording an advance pays nobody). Lifecycle draft → submitted →
--     approved/rejected → completed, cancellable from the live states.
--     approved/rejected are an engine MIRROR: the decision happens in the
--     EXISTING Workflow & Approval Engine (context_entity_type=
--     'business_trip', context id = trip id); the app layer calls the
--     engine's own start RPC and sync_business_trip_decision_v1 only COPIES
--     the terminal outcome back (the timesheets pattern, re-implementing
--     nothing).
--   * business_trip_events — append-only history, trigger-immutable.
--   * expense linkage: ONE additive nullable finance_records.trip_id column
--     + set_finance_record_trip_v1. Reconciliation is DERIVED: the trips
--     surface lists the linked finance rows and their cent-exact sum — no
--     second store, no payment machinery.
--   * 7 gated SECURITY DEFINER commands are the ONLY write paths (direct
--     insert/update/delete REVOKEd, no write policies).
--
-- WHAT IS DELIBERATELY NOT ADDED (binding):
--   - NO travel-booking integration, NO flight/hotel anything;
--   - NO per-diem statutory tables — a per-diem NUMBER may be entered
--     manually as the advance metadata, nothing is computed from law;
--   - NO payment machinery: advance_amount_cents is a recorded number;
--   - NO trips filed FOR someone else (v1: traveler = requester; a manager
--     files their own trips like anyone);
--   - NO new notification types (the engine's workflow types cover it);
--   - NO recreate of ANY existing object — every name below is NEW; the
--     finance_records change is one additive nullable column.
--
-- RLS DECISION, STATED EXPLICITLY:
--   anon:           NOTHING. No grant, no policy.
--   authenticated:  SELECT only, fail-closed —
--     business_trips: the traveler themselves, the org's managers over BOTH
--       membership truths (public.manages_organization), or platform admin;
--     business_trip_events: same audience via ONE definer predicate
--       (business_trip_can_view_v1 — recursion-free precedent).
--     Writes: NO insert/update/delete policy on either table and an explicit
--       REVOKE — the 7 gated commands are the only write paths.
--   service_role:   untouched default (no module-specific widening).
--
-- ROLLBACK: supabase/rollbacks/20260817222000_business_trips_v1.down.sql
-- drops ONLY the 1 trigger, 8 new functions, the finance_records.trip_id
-- column (+ index) and the 2 new tables. No existing object was otherwise
-- touched, so the down file recreates nothing.
-- ============================================================================

begin;

-- ── 0. Safety assertions — the truths this module builds on must exist ──────
do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'organizations missing — this environment predates the org spine';
  end if;
  if to_regclass('public.finance_records') is null then
    raise exception 'finance_records missing — apply 20260711230000 before this migration';
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
     where n.nspname = 'public' and p.proname = 'belongs_to_organization'
  ) then
    raise exception 'belongs_to_organization missing — apply 20260806120000 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'finance_company_authority_v1'
  ) then
    raise exception 'finance_company_authority_v1 missing — apply 20260817123000 before this migration';
  end if;
end $$;

-- ── 1. Tables ───────────────────────────────────────────────────────────────

-- 1a. The trip request. Traveler = requester (v1 rule, header).
create table if not exists public.business_trips (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  profile_id           uuid not null references public.profiles(id) on delete cascade,
  destination          text not null check (
                         char_length(trim(destination)) >= 2
                         and char_length(destination) <= 160
                       ),
  date_from            date not null,
  date_to              date not null,
  purpose              text not null check (
                         char_length(trim(purpose)) >= 3
                         and char_length(purpose) <= 1000
                       ),
  project_id           uuid references public.projects(id) on delete set null,
  status               text not null default 'draft'
                         check (status in
                           ('draft','submitted','approved','rejected','completed','cancelled')),
  -- METADATA ONLY: a manually entered advance/per-diem number in integer
  -- cents. Recording it pays nobody (header, binding).
  advance_amount_cents bigint check (
                         advance_amount_cents is null
                         or (advance_amount_cents >= 0
                             and advance_amount_cents <= 100000000000)
                       ),
  submitted_at         timestamptz,
  decided_at           timestamptz,
  created_by           uuid not null references public.profiles(id) on delete cascade,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint bt_dates_sane check (
    date_to >= date_from
    and date_to - date_from <= 365
  ),
  constraint bt_status_shape check (
    (status = 'draft'     and submitted_at is null     and decided_at is null)
    or (status = 'submitted' and submitted_at is not null and decided_at is null)
    or (status in ('approved','rejected','completed')
                              and submitted_at is not null and decided_at is not null)
    or status = 'cancelled'
  )
);
create index if not exists bt_traveler_idx
  on public.business_trips (profile_id, date_from desc);
create index if not exists bt_org_status_idx
  on public.business_trips (organization_id, status);

comment on table public.business_trips is
  'Business trip requests. approved/rejected MIRROR the Workflow & Approval Engine outcome (context business_trip, context id = trip id) — copied by sync_business_trip_decision_v1, never decided here. advance_amount_cents is manual metadata; no payment machinery exists.';

-- 1b. Append-only lifecycle history.
create table if not exists public.business_trip_events (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.business_trips(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id),
  action           text not null check (action in (
                     'created','updated','submitted','approved','rejected',
                     'completed','cancelled','reopened')),
  note             text check (note is null or char_length(note) <= 500),
  created_at       timestamptz not null default now()
);
create index if not exists bte_trip_idx
  on public.business_trip_events (trip_id, created_at);

comment on table public.business_trip_events is
  'APPEND-ONLY business trip history. Rows are immutable (trigger-enforced for every role incl. service_role).';

-- 1c. Expense linkage — ONE additive nullable column on finance_records.
alter table public.finance_records
  add column if not exists trip_id uuid
    references public.business_trips(id) on delete set null;

create index if not exists fr_trip_idx
  on public.finance_records (trip_id)
  where trip_id is not null;

comment on column public.finance_records.trip_id is
  'Optional business trip this record belongs to. Written ONLY by set_finance_record_trip_v1; trip totals are DERIVED by summing linked rows — never stored.';

-- ── 2. Immutability trigger guard ───────────────────────────────────────────
create or replace function public.business_trip_events_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'business_trip_events is append-only: % is not allowed', tg_op;
end;
$$;
drop trigger if exists business_trip_events_append_only on public.business_trip_events;
create trigger business_trip_events_append_only
  before update or delete on public.business_trip_events
  for each row execute function public.business_trip_events_guard();

-- ── 3. Visibility helper (SECURITY DEFINER, recursion-free policies) ───────
create or replace function public.business_trip_can_view_v1(p_trip_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.business_trips t
     where t.id = p_trip_id
       and (
         t.profile_id = auth.uid()
         or public.manages_organization(t.organization_id)
         or public.is_admin()
       )
  )
$$;
revoke all on function public.business_trip_can_view_v1(uuid) from public;
revoke all on function public.business_trip_can_view_v1(uuid) from anon;
grant execute on function public.business_trip_can_view_v1(uuid) to authenticated;

-- ── 4. RLS — SELECT-only, fail-closed; writes stay RPC-only ────────────────
alter table public.business_trips enable row level security;
alter table public.business_trip_events enable row level security;

revoke all on public.business_trips, public.business_trip_events from public;
revoke all on public.business_trips, public.business_trip_events from anon;
revoke all on public.business_trips, public.business_trip_events from authenticated;
grant select on public.business_trips, public.business_trip_events to authenticated;

drop policy if exists business_trips_select on public.business_trips;
create policy business_trips_select on public.business_trips
  for select to authenticated
  using (
    profile_id = auth.uid()
    or public.manages_organization(organization_id)
    or public.is_admin()
  );

drop policy if exists business_trip_events_select on public.business_trip_events;
create policy business_trip_events_select on public.business_trip_events
  for select to authenticated
  using (public.business_trip_can_view_v1(trip_id));

-- No insert/update/delete policy anywhere: with the explicit REVOKE above,
-- the commands below are the ONLY write paths.

-- ── 5. Commands (SECURITY DEFINER, outcome-string contract) ────────────────

-- 5a. create_business_trip_v1 — the traveler files their own trip. Returns
-- the new trip id (uuid-as-text) on success; a short outcome string
-- otherwise (TS layer distinguishes by UUID shape).
create or replace function public.create_business_trip_v1(
  p_organization_id      text,
  p_destination          text,
  p_date_from            text,
  p_date_to              text,
  p_purpose              text,
  p_project_id           text,
  p_advance_amount_cents text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_org      uuid;
  v_dest     text := nullif(trim(coalesce(p_destination, '')), '');
  v_purpose  text := nullif(trim(coalesce(p_purpose, '')), '');
  v_from     date;
  v_to       date;
  v_project  uuid;
  v_adv_text text := nullif(trim(coalesce(p_advance_amount_cents, '')), '');
  v_advance  bigint;
  v_id       uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_org     := nullif(trim(coalesce(p_organization_id, '')), '')::uuid;
    v_project := nullif(trim(coalesce(p_project_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_org is null then return 'invalid'; end if;
  if v_dest is null or char_length(v_dest) < 2 or char_length(v_dest) > 160 then
    return 'invalid';
  end if;
  if v_purpose is null or char_length(v_purpose) < 3 or char_length(v_purpose) > 1000 then
    return 'invalid';
  end if;
  if coalesce(trim(p_date_from), '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(trim(p_date_to), '') !~ '^\d{4}-\d{2}-\d{2}$' then
    return 'invalid';
  end if;
  begin
    v_from := trim(p_date_from)::date;
    v_to   := trim(p_date_to)::date;
  exception when others then
    return 'invalid';
  end;
  if v_to < v_from or v_to - v_from > 365 then
    return 'invalid_dates';
  end if;
  if v_adv_text is not null then
    if v_adv_text !~ '^[0-9]{1,12}$' then return 'invalid'; end if;
    v_advance := v_adv_text::bigint;
    if v_advance < 0 or v_advance > 100000000000 then return 'invalid'; end if;
  end if;

  -- Org boundary over BOTH membership truths. Merged with "org missing" —
  -- no oracle.
  if not (public.belongs_to_organization(v_org) or public.is_admin()) then
    return 'not_found';
  end if;

  -- The project link is informational; the row must exist (RLS decides what
  -- the reader later sees of it). Missing project answers 'not_allowed'.
  if v_project is not null and not exists (
    select 1 from public.projects p where p.id = v_project
  ) then
    return 'not_allowed';
  end if;

  -- Abuse cap: open (draft/submitted) trips per traveler.
  if (select count(*) from public.business_trips t
       where t.profile_id = uid
         and t.status in ('draft','submitted')) >= 50 then
    return 'limit_reached';
  end if;

  insert into public.business_trips
    (organization_id, profile_id, destination, date_from, date_to, purpose,
     project_id, status, advance_amount_cents, created_by)
  values
    (v_org, uid, v_dest, v_from, v_to, v_purpose,
     v_project, 'draft', v_advance, uid)
  returning id into v_id;

  insert into public.business_trip_events (trip_id, actor_profile_id, action)
  values (v_id, uid, 'created');

  return v_id::text;
end;
$$;
revoke all on function public.create_business_trip_v1(text, text, text, text, text, text, text) from public;
revoke all on function public.create_business_trip_v1(text, text, text, text, text, text, text) from anon;
grant execute on function public.create_business_trip_v1(text, text, text, text, text, text, text) to authenticated;

-- 5b. update_business_trip_v1 — bounded fields of the traveler's own DRAFT.
create or replace function public.update_business_trip_v1(
  p_trip_id              text,
  p_destination          text,
  p_date_from            text,
  p_date_to              text,
  p_purpose              text,
  p_advance_amount_cents text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_id       uuid;
  v_dest     text := nullif(trim(coalesce(p_destination, '')), '');
  v_purpose  text := nullif(trim(coalesce(p_purpose, '')), '');
  v_from     date;
  v_to       date;
  v_adv_text text := nullif(trim(coalesce(p_advance_amount_cents, '')), '');
  v_advance  bigint;
  v_row      record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_trip_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;
  if v_dest is null or char_length(v_dest) < 2 or char_length(v_dest) > 160 then
    return 'invalid';
  end if;
  if v_purpose is null or char_length(v_purpose) < 3 or char_length(v_purpose) > 1000 then
    return 'invalid';
  end if;
  if coalesce(trim(p_date_from), '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(trim(p_date_to), '') !~ '^\d{4}-\d{2}-\d{2}$' then
    return 'invalid';
  end if;
  begin
    v_from := trim(p_date_from)::date;
    v_to   := trim(p_date_to)::date;
  exception when others then
    return 'invalid';
  end;
  if v_to < v_from or v_to - v_from > 365 then
    return 'invalid_dates';
  end if;
  if v_adv_text is not null then
    if v_adv_text !~ '^[0-9]{1,12}$' then return 'invalid'; end if;
    v_advance := v_adv_text::bigint;
    if v_advance < 0 or v_advance > 100000000000 then return 'invalid'; end if;
  end if;

  select t.id, t.status, t.profile_id
    into v_row
    from public.business_trips t
   where t.id = v_id
   for update;
  -- Merged: missing row and someone else's trip answer the same — no oracle.
  if v_row.id is null or v_row.profile_id <> uid then
    return 'not_found';
  end if;
  if v_row.status <> 'draft' then return 'not_editable'; end if;

  update public.business_trips
     set destination = v_dest,
         date_from = v_from,
         date_to = v_to,
         purpose = v_purpose,
         advance_amount_cents = v_advance,
         updated_at = now()
   where id = v_row.id;

  insert into public.business_trip_events (trip_id, actor_profile_id, action)
  values (v_row.id, uid, 'updated');

  return 'updated';
end;
$$;
revoke all on function public.update_business_trip_v1(text, text, text, text, text, text) from public;
revoke all on function public.update_business_trip_v1(text, text, text, text, text, text) from anon;
grant execute on function public.update_business_trip_v1(text, text, text, text, text, text) to authenticated;

-- 5c. submit_business_trip_v1 — the traveler hands their DRAFT to the
-- approval flow (draft → submitted). The engine instance itself is started
-- by the app layer through the engine's own start RPC (context
-- 'business_trip', context id = this id) — this command never re-implements
-- the engine.
create or replace function public.submit_business_trip_v1(
  p_trip_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_id  uuid;
  v_row record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_trip_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select t.id, t.status, t.profile_id
    into v_row
    from public.business_trips t
   where t.id = v_id
   for update;
  if v_row.id is null or v_row.profile_id <> uid then
    return 'not_found';
  end if;
  if v_row.status = 'submitted' then return 'already_submitted'; end if;
  if v_row.status <> 'draft' then return 'not_editable'; end if;

  update public.business_trips
     set status = 'submitted',
         submitted_at = now(),
         decided_at = null,
         updated_at = now()
   where id = v_row.id;

  insert into public.business_trip_events (trip_id, actor_profile_id, action)
  values (v_row.id, uid, 'submitted');

  return 'submitted';
end;
$$;
revoke all on function public.submit_business_trip_v1(text) from public;
revoke all on function public.submit_business_trip_v1(text) from anon;
grant execute on function public.submit_business_trip_v1(text) to authenticated;

-- 5d. sync_business_trip_decision_v1 — copy the engine's TERMINAL outcome
-- onto a SUBMITTED trip. NEVER decides anything:
--   engine approved            -> trip approved
--   engine rejected            -> trip rejected
--   engine withdrawn/cancelled -> trip back to draft (never silently
--                                 approved; submitted_at cleared)
--   engine still pending       -> 'still_pending' (no write)
--   no engine instance         -> 'no_instance'   (no write)
-- Callable by anyone who may VIEW the trip (traveler, org manager, admin).
create or replace function public.sync_business_trip_decision_v1(
  p_trip_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_id  uuid;
  v_row record;
  v_wf  record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_trip_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select t.id, t.status, t.profile_id, t.organization_id
    into v_row
    from public.business_trips t
   where t.id = v_id
   for update;
  if v_row.id is null
     or not (v_row.profile_id = uid
             or public.manages_organization(v_row.organization_id)
             or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.status <> 'submitted' then return 'not_submitted'; end if;

  select i.status into v_wf
    from public.workflow_instances i
   where i.context_entity_type = 'business_trip'
     and i.context_entity_id = v_row.id
   order by i.created_at desc
   limit 1;
  if v_wf.status is null then return 'no_instance'; end if;
  if v_wf.status = 'pending' then return 'still_pending'; end if;

  if v_wf.status = 'approved' then
    update public.business_trips
       set status = 'approved', decided_at = now(), updated_at = now()
     where id = v_row.id;
    insert into public.business_trip_events (trip_id, actor_profile_id, action)
    values (v_row.id, uid, 'approved');
    return 'approved';
  end if;

  if v_wf.status = 'rejected' then
    update public.business_trips
       set status = 'rejected', decided_at = now(), updated_at = now()
     where id = v_row.id;
    insert into public.business_trip_events (trip_id, actor_profile_id, action)
    values (v_row.id, uid, 'rejected');
    return 'rejected';
  end if;

  -- withdrawn / cancelled — the request went away; back to draft.
  update public.business_trips
     set status = 'draft', submitted_at = null, decided_at = null, updated_at = now()
   where id = v_row.id;
  insert into public.business_trip_events (trip_id, actor_profile_id, action, note)
  values (v_row.id, uid, 'reopened', 'workflow ' || v_wf.status);
  return 'reopened';
end;
$$;
revoke all on function public.sync_business_trip_decision_v1(text) from public;
revoke all on function public.sync_business_trip_decision_v1(text) from anon;
grant execute on function public.sync_business_trip_decision_v1(text) to authenticated;

-- 5e. complete_business_trip_v1 — an APPROVED trip is marked completed by
-- the traveler or an org manager. Completion changes a status; the linked
-- expense total stays DERIVED from finance_records.trip_id rows.
create or replace function public.complete_business_trip_v1(
  p_trip_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_id  uuid;
  v_row record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_trip_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select t.id, t.status, t.profile_id, t.organization_id
    into v_row
    from public.business_trips t
   where t.id = v_id
   for update;
  if v_row.id is null
     or not (v_row.profile_id = uid
             or public.manages_organization(v_row.organization_id)
             or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.status <> 'approved' then return 'not_approved'; end if;

  update public.business_trips
     set status = 'completed', updated_at = now()
   where id = v_row.id;

  insert into public.business_trip_events (trip_id, actor_profile_id, action)
  values (v_row.id, uid, 'completed');

  return 'completed';
end;
$$;
revoke all on function public.complete_business_trip_v1(text) from public;
revoke all on function public.complete_business_trip_v1(text) from anon;
grant execute on function public.complete_business_trip_v1(text) to authenticated;

-- 5f. cancel_business_trip_v1 — the traveler or an org manager cancels a
-- live (draft/submitted/approved) trip. A pending engine instance is
-- withdrawn by the APP layer through the engine's own withdraw RPC before
-- this is called — this command never touches engine rows.
create or replace function public.cancel_business_trip_v1(
  p_trip_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_id  uuid;
  v_row record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_trip_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select t.id, t.status, t.profile_id, t.organization_id
    into v_row
    from public.business_trips t
   where t.id = v_id
   for update;
  if v_row.id is null
     or not (v_row.profile_id = uid
             or public.manages_organization(v_row.organization_id)
             or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.status not in ('draft','submitted','approved') then
    return 'not_editable';
  end if;

  update public.business_trips
     set status = 'cancelled', updated_at = now()
   where id = v_row.id;

  insert into public.business_trip_events (trip_id, actor_profile_id, action)
  values (v_row.id, uid, 'cancelled');

  return 'cancelled';
end;
$$;
revoke all on function public.cancel_business_trip_v1(text) from public;
revoke all on function public.cancel_business_trip_v1(text) from anon;
grant execute on function public.cancel_business_trip_v1(text) to authenticated;

-- 5g. set_finance_record_trip_v1 — point a finance record at a trip the
-- caller may view (or unlink with an empty trip id). The ONLY writer of
-- finance_records.trip_id; totals stay derived.
create or replace function public.set_finance_record_trip_v1(
  p_record_id text,
  p_trip_id   text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_id   uuid;
  v_trip uuid;
  v_row  record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id   := nullif(trim(coalesce(p_record_id, '')), '')::uuid;
    v_trip := nullif(trim(coalesce(p_trip_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select fr.id, fr.company_id, fr.created_by
    into v_row
    from public.finance_records fr
   where fr.id = v_id
   for update;
  -- Merged: missing row and no finance authority answer the same — no oracle.
  if v_row.id is null
     or not (v_row.created_by = uid
             or public.is_admin()
             or public.finance_company_authority_v1(v_row.company_id)) then
    return 'not_found';
  end if;

  -- Missing trip and unviewable trip answer the same — no oracle.
  if v_trip is not null and not public.business_trip_can_view_v1(v_trip) then
    return 'not_allowed';
  end if;

  update public.finance_records
     set trip_id = v_trip,
         updated_at = now()
   where id = v_row.id;

  return case when v_trip is null then 'unlinked' else 'linked' end;
end;
$$;
revoke all on function public.set_finance_record_trip_v1(text, text) from public;
revoke all on function public.set_finance_record_trip_v1(text, text) from anon;
grant execute on function public.set_finance_record_trip_v1(text, text) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260817222000_business_trips_v1.down.sql
-- restores the prior state exactly (drops the 1 trigger, 8 new functions,
-- the finance_records.trip_id column + index, and the 2 new tables).
