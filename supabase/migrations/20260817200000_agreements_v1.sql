-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after the lead session's
-- verification. Never `db push`.
-- Gate doc: docs/human-gates/agreements-gate.md
-- Rollback:  supabase/rollbacks/20260817200000_agreements_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- GRANTs + new RLS-bearing tables + triggers are RED-class; there is no
-- non-RED way to add a row-level-secured register). Annotation pre-approved
-- by owner mandate 2026-08-17 (autonomous functional completion train V2,
-- §4 migration authority). SAFETY CLASS: RED — 3 new tables, 1 visibility
-- helper, 8 SECURITY DEFINER commands, 2 trigger guards, EXECUTE grants.
-- ZERO existing table, policy, grant, trigger or function is modified or
-- recreated. ZERO DML at apply time. Prod apply stays manual by the LEAD
-- session via Supabase MCP. APPLY ORDER: AFTER
-- 20260817130000_workflow_engine_v1.sql AND
-- 20260817140000_document_file_layer_v1.sql (hard dependencies, asserted).
--
-- 20260817200000 — Agreement & Rights Engine v1 (canonical agreement
-- register + amendments + honest signature evidence).
--
-- PROBLEM (full reality audit 2026-08-17, DOCUMENTS/LEGAL): employment
-- contracts MISSING, amendments MISSING, parties model PARTIAL/DEAD, expiry
-- PARTIAL. The existing `contracts` table is a personal B2B commercial
-- register (owner-scoped, free-text parties, no amendments, no org scope).
-- There is no org-scoped register for employment-related and general
-- agreements, no amendment history, and no honest place to record that a
-- signature happened OUTSIDE the platform.
--
-- SOLUTION (smallest honest slice):
--   * `agreements` — ONE org-scoped register for BOTH employment-related
--     and general agreements (service/supply/nda/partnership/other), with
--     bounded counterparty fields, an optional worker link for
--     employment-related rows, responsible person, effective dates, and the
--     agreement TEXT living in the EXISTING document engine
--     (current_document_id → org_documents; nothing is duplicated).
--   * `agreement_amendments` — APPEND-ONLY amendment records (trigger
--     enforced). Amending NEVER rewrites the base row's document pointer:
--     the base keeps its original document; "current terms" = base + the
--     ordered amendments, rendered honestly in the UI.
--   * `agreement_events` — append-only audit ledger (trigger enforced,
--     the org_document_events / workflow_transitions precedent).
--   * 8 gated SECURITY DEFINER commands are the ONLY write paths.
--   * Optional INTERNAL approval rides the EXISTING Workflow & Approval
--     Engine (context_entity_type 'agreement' is already in its closed
--     vocabulary): the app layer starts an instance via the engine's own
--     RPCs; `submit_agreement_for_approval_v1` flips the status MIRROR only
--     when a real pending instance exists, and `sync_agreement_approval_v1`
--     is idempotent read-repair from the engine's terminal states. This
--     engine never re-implements approval logic.
--
-- LEGAL DOCTRINE (binding): LEGAL CONTROL BEFORE TECHNICAL REPRESENTATION.
-- A database status NEVER implies SIGNED / LEGAL / VALID / BINDING. The
-- status vocabulary is honest RECORD-KEEPING state only ('draft',
-- 'submitted_for_approval', 'approved_internally', 'active_record',
-- 'amended', 'terminated_record', 'expired' — "approved_internally" means an
-- internal review said yes, nothing more; "active_record" means the
-- organization treats the record as current, nothing more). Signature
-- evidence is a SEPARATE, explicitly-labeled field pair:
-- signature_status in ('none','externally_signed_evidence_attached') plus a
-- document_files evidence link. LabourMarket.ai does not execute legal
-- signatures; any signature happened OUTSIDE the platform (the
-- commercial.noSignatureNote precedent, extended). NO e-signature flow, NO
-- signing provider, paid or otherwise.
--
-- WHAT IS DELIBERATELY NOT ADDED (out of scope, binding):
--   - NO e-signature, NO signing provider integration;
--   - NO worker-side agreement UI this train (org-side only; consent
--     doctrine for worker-linked reads is honoured by NOT widening any
--     worker-facing read — a worker-linked row is readable only by the org
--     governance side that created it, plus platform admin);
--   - NO change to the existing B2B `contracts` table or its RPCs — it
--     stays the legacy commercial register; migrating its rows here is a
--     LATER owner decision, no data moves now;
--   - NO notification-constraint change: `notification_events` has no
--     'agreement' entity type and this migration does NOT widen it; expiry
--     indication is render-time derivation only (the documents 30-day
--     precedent);
--   - NO scheduler, NO external sending of any kind.
--
-- RLS DECISION, STATED EXPLICITLY:
--   anon:           NOTHING. No grant, no policy.
--   authenticated:  SELECT only, fail-closed —
--     agreements: the org's governance owner/admin (org_owner_admin_v1,
--       the document-engine helper), the row's responsible person, or
--       platform admin. Plain members and engagement-truth members do NOT
--       read the register (agreements carry counterparty and worker links;
--       privacy-first default, same posture as finance);
--     agreement_amendments / agreement_events: ONE definer predicate,
--       can_view_agreement_v1, mirrors the parent row's visibility
--       (assets-recursion-precedent shape, no policy-time join).
--     Writes: NO insert/update/delete policy on ANY table and an explicit
--       REVOKE — the 8 gated commands are the only write paths.
--   service_role:   untouched default (no engine-specific widening).
--
-- ROLLBACK: supabase/rollbacks/20260817200000_agreements_v1.down.sql
-- restores the prior state exactly: drops ONLY the 2 triggers, 2 trigger
-- functions, 9 new functions and 3 new tables (feature-created rows live
-- ONLY in those tables; 0-row guarded). No existing object was touched, so
-- the down file recreates nothing.
-- ============================================================================

begin;

-- ── 0. Safety assertions — the engines this register consumes must exist ────
do $$
begin
  if to_regclass('public.org_documents') is null then
    raise exception 'org_documents missing — apply 20260817140000_document_file_layer_v1 before this migration';
  end if;
  if to_regclass('public.document_files') is null then
    raise exception 'document_files missing — apply 20260817140000_document_file_layer_v1 before this migration';
  end if;
  if to_regclass('public.workflow_instances') is null then
    raise exception 'workflow_instances missing — apply 20260817130000_workflow_engine_v1 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'org_owner_admin_v1'
  ) then
    raise exception 'org_owner_admin_v1 missing — apply 20260817140000_document_file_layer_v1 before this migration';
  end if;
end $$;

-- ── 1. Tables ───────────────────────────────────────────────────────────────

-- 1a. The canonical org-scoped agreement register.
create table if not exists public.agreements (
  id                         uuid primary key default gen_random_uuid(),
  organization_id            uuid not null references public.organizations(id) on delete cascade,
  agreement_type             text not null check (agreement_type in (
                               'employment_related','service','supply','nda','partnership','other')),
  title                      text not null check (char_length(title) between 3 and 200),
  counterparty_name          text not null check (char_length(counterparty_name) between 1 and 200),
  counterparty_org_number    text check (counterparty_org_number is null
                               or char_length(counterparty_org_number) <= 60),
  -- Worker link is ONLY meaningful for employment-related records; the CHECK
  -- makes a mislabeled link impossible. Consent doctrine: this link never
  -- widens any worker-facing read (see RLS decision above).
  worker_id                  uuid references public.workers(id) on delete set null,
  responsible_profile_id     uuid references public.profiles(id) on delete set null,
  effective_from             date,
  effective_to               date,
  -- HONEST RECORD-KEEPING STATES ONLY. None of these words claims legal
  -- effect: nothing here means signed, legal, valid or binding.
  status                     text not null default 'draft' check (status in (
                               'draft','submitted_for_approval','approved_internally',
                               'active_record','amended','terminated_record','expired')),
  -- Signature EVIDENCE, separate and explicit. The platform executes no
  -- signature; 'externally_signed_evidence_attached' records only that the
  -- organization attached a file it says evidences a signature made OUTSIDE
  -- the platform.
  signature_status           text not null default 'none' check (signature_status in (
                               'none','externally_signed_evidence_attached')),
  signature_evidence_file_id uuid references public.document_files(id) on delete set null,
  -- The agreement TEXT lives in the document engine.
  current_document_id        uuid references public.org_documents(id) on delete set null,
  external_ref               text check (external_ref is null or char_length(external_ref) <= 200),
  created_by                 uuid not null references public.profiles(id) on delete cascade,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint agreements_dates_shape check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  ),
  constraint agreements_worker_link_shape check (
    worker_id is null or agreement_type = 'employment_related'
  ),
  constraint agreements_signature_evidence_shape check (
    (signature_status = 'none')
    or
    (signature_status = 'externally_signed_evidence_attached'
     and signature_evidence_file_id is not null)
  )
);
create index if not exists agreements_org_status_idx
  on public.agreements (organization_id, status);
create index if not exists agreements_org_expiry_idx
  on public.agreements (organization_id, effective_to)
  where effective_to is not null;

comment on column public.agreements.status is
  'HONEST record-keeping state only. NEVER implies signed/legal/valid/binding — the platform executes no legal signatures.';
comment on column public.agreements.signature_status is
  'Evidence label only: none, or externally_signed_evidence_attached (a file said to evidence a signature made OUTSIDE the platform). Never a legal claim.';

-- 1b. Append-only amendments. The base row keeps its original document;
-- current terms = base + ordered amendments.
create table if not exists public.agreement_amendments (
  id             uuid primary key default gen_random_uuid(),
  agreement_id   uuid not null references public.agreements(id) on delete cascade,
  sequence       int not null check (sequence between 1 and 100),
  title          text not null check (char_length(title) between 3 and 200),
  description    text check (description is null or char_length(description) <= 2000),
  document_id    uuid references public.org_documents(id) on delete set null,
  effective_date date,
  created_by     uuid not null references public.profiles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint agreement_amendments_seq_uq unique (agreement_id, sequence)
);
create index if not exists agreement_amendments_agreement_idx
  on public.agreement_amendments (agreement_id, sequence);

comment on table public.agreement_amendments is
  'APPEND-ONLY amendment records (trigger-enforced for every role incl. service_role). An amendment is history, never an edit.';

-- 1c. Append-only audit ledger.
create table if not exists public.agreement_events (
  id           uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  actor_id     uuid not null references public.profiles(id),
  event_type   text not null check (event_type in (
                 'created','updated','status_changed','amended','terminated','evidence_attached')),
  before_state jsonb check (before_state is null or pg_column_size(before_state) <= 2048),
  after_state  jsonb check (after_state is null or pg_column_size(after_state) <= 2048),
  created_at   timestamptz not null default now()
);
create index if not exists agreement_events_agreement_idx
  on public.agreement_events (agreement_id, created_at);

comment on table public.agreement_events is
  'APPEND-ONLY agreement audit ledger. Rows are immutable (trigger-enforced for every role incl. service_role).';

-- ── 2. Immutability trigger guards ──────────────────────────────────────────

create or replace function public.agreement_events_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'agreement_events is append-only: % is not allowed', tg_op;
end;
$$;
drop trigger if exists agreement_events_append_only on public.agreement_events;
create trigger agreement_events_append_only
  before update or delete on public.agreement_events
  for each row execute function public.agreement_events_guard();

create or replace function public.agreement_amendments_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'agreement_amendments is append-only: % is not allowed', tg_op;
end;
$$;
drop trigger if exists agreement_amendments_append_only on public.agreement_amendments;
create trigger agreement_amendments_append_only
  before update or delete on public.agreement_amendments
  for each row execute function public.agreement_amendments_guard();

-- ── 3. Visibility helper (definer, recursion-free child policies) ───────────

-- Who may read an agreement: the org's governance owner/admin (the
-- document-engine helper), the row's responsible person, or platform admin.
create or replace function public.can_view_agreement_v1(p_agreement_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.agreements a
     where a.id = p_agreement_id
       and (
         public.org_owner_admin_v1(a.organization_id)
         or a.responsible_profile_id = auth.uid()
         or public.is_admin()
       )
  )
$$;
revoke all on function public.can_view_agreement_v1(uuid) from public;
revoke all on function public.can_view_agreement_v1(uuid) from anon;
grant execute on function public.can_view_agreement_v1(uuid) to authenticated;

-- ── 4. RLS — SELECT-only, fail-closed; writes stay RPC-only ────────────────

alter table public.agreements enable row level security;
alter table public.agreement_amendments enable row level security;
alter table public.agreement_events enable row level security;

revoke all on public.agreements,
              public.agreement_amendments,
              public.agreement_events
  from public;
revoke all on public.agreements,
              public.agreement_amendments,
              public.agreement_events
  from anon;
revoke all on public.agreements,
              public.agreement_amendments,
              public.agreement_events
  from authenticated;
grant select on public.agreements,
                public.agreement_amendments,
                public.agreement_events
  to authenticated;

drop policy if exists agreements_select on public.agreements;
create policy agreements_select on public.agreements
  for select to authenticated
  using (
    public.org_owner_admin_v1(organization_id)
    or responsible_profile_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists agreement_amendments_select on public.agreement_amendments;
create policy agreement_amendments_select on public.agreement_amendments
  for select to authenticated
  using (public.can_view_agreement_v1(agreement_id));

drop policy if exists agreement_events_select on public.agreement_events;
create policy agreement_events_select on public.agreement_events
  for select to authenticated
  using (public.can_view_agreement_v1(agreement_id));

-- No insert/update/delete policy anywhere: with the explicit REVOKE above,
-- the commands below are the ONLY write paths.

-- ── 5. Commands (SECURITY DEFINER, outcome-string contract) ────────────────

-- 5a. create_agreement_v1 — org owner/admin registers an agreement record.
create or replace function public.create_agreement_v1(
  p_organization_id        uuid,
  p_agreement_type         text,
  p_title                  text,
  p_counterparty_name      text,
  p_counterparty_org_number text,
  p_worker_id              text,
  p_responsible_profile_id text,
  p_effective_from         text,
  p_effective_to           text,
  p_external_ref           text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid            uuid := auth.uid();
  v_type         text := nullif(trim(coalesce(p_agreement_type, '')), '');
  v_title        text := nullif(trim(coalesce(p_title, '')), '');
  v_counterparty text := nullif(trim(coalesce(p_counterparty_name, '')), '');
  v_org_number   text := nullif(trim(coalesce(p_counterparty_org_number, '')), '');
  v_external_ref text := nullif(trim(coalesce(p_external_ref, '')), '');
  v_worker       uuid;
  v_responsible  uuid;
  v_from         date;
  v_to           date;
  open_count     integer;
  row_id         uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_organization_id is null
     or not (public.org_owner_admin_v1(p_organization_id) or public.is_admin()) then
    -- One answer, no existence leak.
    return 'not_allowed';
  end if;
  if v_type is null or v_type not in
     ('employment_related','service','supply','nda','partnership','other') then
    return 'invalid';
  end if;
  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 200 then
    return 'invalid';
  end if;
  if v_counterparty is null or char_length(v_counterparty) > 200 then
    return 'invalid';
  end if;
  if v_org_number is not null and char_length(v_org_number) > 60 then
    return 'invalid';
  end if;
  if v_external_ref is not null and char_length(v_external_ref) > 200 then
    return 'invalid';
  end if;
  begin
    v_worker      := nullif(trim(coalesce(p_worker_id, '')), '')::uuid;
    v_responsible := nullif(trim(coalesce(p_responsible_profile_id, '')), '')::uuid;
    v_from        := nullif(trim(coalesce(p_effective_from, '')), '')::date;
    v_to          := nullif(trim(coalesce(p_effective_to, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return 'invalid';
  end;
  if v_to is not null and v_from is not null and v_to < v_from then
    return 'invalid';
  end if;
  -- Worker link only on employment-related records, and only a real worker.
  if v_worker is not null then
    if v_type <> 'employment_related' then
      return 'invalid';
    end if;
    if not exists (select 1 from public.workers w where w.id = v_worker) then
      return 'invalid';
    end if;
  end if;
  if v_responsible is not null and not exists (
       select 1 from public.company_memberships m
        where m.profile_id = v_responsible
          and m.organization_id = p_organization_id
          and m.status = 'active') then
    return 'invalid';
  end if;

  -- Abuse cap: a bounded register per organization.
  select count(*) into open_count
    from public.agreements a
   where a.organization_id = p_organization_id
     and a.status not in ('terminated_record','expired');
  if open_count >= 500 then
    return 'limit_reached';
  end if;

  insert into public.agreements
      (organization_id, agreement_type, title, counterparty_name,
       counterparty_org_number, worker_id, responsible_profile_id,
       effective_from, effective_to, external_ref, created_by)
    values
      (p_organization_id, v_type, v_title, v_counterparty,
       v_org_number, v_worker, v_responsible,
       v_from, v_to, v_external_ref, uid)
    returning id into row_id;

  insert into public.agreement_events (agreement_id, actor_id, event_type, after_state)
    values (row_id, uid, 'created',
            jsonb_build_object('title', v_title, 'agreement_type', v_type,
                               'counterparty_name', v_counterparty));
  return 'created';
end $$;
revoke all on function public.create_agreement_v1(uuid, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.create_agreement_v1(uuid, text, text, text, text, text, text, text, text, text) from anon;
grant execute on function public.create_agreement_v1(uuid, text, text, text, text, text, text, text, text, text) to authenticated;

-- 5b. update_agreement_v1 — bounded edits while the record is not terminal.
create or replace function public.update_agreement_v1(
  p_agreement_id           uuid,
  p_title                  text,
  p_counterparty_name      text,
  p_counterparty_org_number text,
  p_responsible_profile_id text,
  p_effective_from         text,
  p_effective_to           text,
  p_external_ref           text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid            uuid := auth.uid();
  v_row          public.agreements%rowtype;
  v_title        text := nullif(trim(coalesce(p_title, '')), '');
  v_counterparty text := nullif(trim(coalesce(p_counterparty_name, '')), '');
  v_org_number   text := nullif(trim(coalesce(p_counterparty_org_number, '')), '');
  v_external_ref text := nullif(trim(coalesce(p_external_ref, '')), '');
  v_responsible  uuid;
  v_from         date;
  v_to           date;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.agreements where id = p_agreement_id;
  -- Merged: missing row and no authority answer the same — no oracle.
  if v_row.id is null
     or not (public.org_owner_admin_v1(v_row.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.status in ('terminated_record','expired') then
    return 'not_editable';
  end if;
  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 200 then
    return 'invalid';
  end if;
  if v_counterparty is null or char_length(v_counterparty) > 200 then
    return 'invalid';
  end if;
  if v_org_number is not null and char_length(v_org_number) > 60 then
    return 'invalid';
  end if;
  if v_external_ref is not null and char_length(v_external_ref) > 200 then
    return 'invalid';
  end if;
  begin
    v_responsible := nullif(trim(coalesce(p_responsible_profile_id, '')), '')::uuid;
    v_from        := nullif(trim(coalesce(p_effective_from, '')), '')::date;
    v_to          := nullif(trim(coalesce(p_effective_to, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return 'invalid';
  end;
  if v_to is not null and v_from is not null and v_to < v_from then
    return 'invalid';
  end if;
  if v_responsible is not null and not exists (
       select 1 from public.company_memberships m
        where m.profile_id = v_responsible
          and m.organization_id = v_row.organization_id
          and m.status = 'active') then
    return 'invalid';
  end if;

  update public.agreements
     set title = v_title,
         counterparty_name = v_counterparty,
         counterparty_org_number = v_org_number,
         responsible_profile_id = v_responsible,
         effective_from = v_from,
         effective_to = v_to,
         external_ref = v_external_ref,
         updated_at = now()
   where id = v_row.id;

  insert into public.agreement_events (agreement_id, actor_id, event_type, before_state, after_state)
    values (v_row.id, uid, 'updated',
            jsonb_build_object('title', v_row.title, 'counterparty_name', v_row.counterparty_name),
            jsonb_build_object('title', v_title, 'counterparty_name', v_counterparty));
  return 'updated';
end $$;
revoke all on function public.update_agreement_v1(uuid, text, text, text, text, text, text, text) from public;
revoke all on function public.update_agreement_v1(uuid, text, text, text, text, text, text, text) from anon;
grant execute on function public.update_agreement_v1(uuid, text, text, text, text, text, text, text) to authenticated;

-- 5c. set_agreement_status_v1 — the honest record state machine. Manual
-- transitions ONLY between record-keeping states; 'submitted_for_approval'
-- is never reachable here (submit RPC only), and only sync repair leaves it.
create or replace function public.set_agreement_status_v1(
  p_agreement_id uuid,
  p_status       text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_row    public.agreements%rowtype;
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_event  text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.agreements where id = p_agreement_id;
  if v_row.id is null
     or not (public.org_owner_admin_v1(v_row.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_status is null or v_status not in
     ('active_record','terminated_record','expired') then
    return 'invalid';
  end if;
  -- Allowed manual transitions (record-keeping only, no legal claim):
  --   draft               -> active_record | terminated_record
  --   approved_internally -> active_record | terminated_record
  --   active_record       -> terminated_record | expired
  --   amended             -> terminated_record | expired
  if not (
    (v_row.status in ('draft','approved_internally') and v_status in ('active_record','terminated_record'))
    or
    (v_row.status in ('active_record','amended') and v_status in ('terminated_record','expired'))
  ) then
    return 'invalid_transition';
  end if;

  update public.agreements
     set status = v_status, updated_at = now()
   where id = v_row.id;

  v_event := case when v_status = 'terminated_record' then 'terminated' else 'status_changed' end;
  insert into public.agreement_events (agreement_id, actor_id, event_type, before_state, after_state)
    values (v_row.id, uid, v_event,
            jsonb_build_object('status', v_row.status),
            jsonb_build_object('status', v_status));
  return 'updated';
end $$;
revoke all on function public.set_agreement_status_v1(uuid, text) from public;
revoke all on function public.set_agreement_status_v1(uuid, text) from anon;
grant execute on function public.set_agreement_status_v1(uuid, text) to authenticated;

-- 5d. submit_agreement_for_approval_v1 — flips the MIRROR only when a real
-- pending workflow instance for THIS agreement exists (the app layer starts
-- the instance through the engine's own start_workflow_instance_v1 first).
create or replace function public.submit_agreement_for_approval_v1(
  p_agreement_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_row public.agreements%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.agreements where id = p_agreement_id;
  if v_row.id is null
     or not (public.org_owner_admin_v1(v_row.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.status <> 'draft' then
    return 'invalid_transition';
  end if;
  if not exists (
    select 1 from public.workflow_instances i
     where i.context_entity_type = 'agreement'
       and i.context_entity_id = v_row.id
       and i.organization_id = v_row.organization_id
       and i.status = 'pending'
  ) then
    return 'no_pending_workflow';
  end if;

  update public.agreements
     set status = 'submitted_for_approval', updated_at = now()
   where id = v_row.id;

  insert into public.agreement_events (agreement_id, actor_id, event_type, before_state, after_state)
    values (v_row.id, uid, 'status_changed',
            jsonb_build_object('status', v_row.status),
            jsonb_build_object('status', 'submitted_for_approval'));
  return 'submitted';
end $$;
revoke all on function public.submit_agreement_for_approval_v1(uuid) from public;
revoke all on function public.submit_agreement_for_approval_v1(uuid) from anon;
grant execute on function public.submit_agreement_for_approval_v1(uuid) to authenticated;

-- 5e. sync_agreement_approval_v1 — idempotent READ-REPAIR of the status
-- mirror from the workflow engine's terminal truth. Never decides anything:
-- it only converges the mirror onto what the engine already recorded.
create or replace function public.sync_agreement_approval_v1(
  p_agreement_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_row    public.agreements%rowtype;
  v_state  text;
  v_target text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.agreements where id = p_agreement_id;
  -- Repair is convergence, not discretion: anyone who may VIEW may repair.
  if v_row.id is null or not public.can_view_agreement_v1(p_agreement_id) then
    return 'not_found';
  end if;
  if v_row.status <> 'submitted_for_approval' then
    return 'unchanged';
  end if;

  select i.status into v_state
    from public.workflow_instances i
   where i.context_entity_type = 'agreement'
     and i.context_entity_id = v_row.id
     and i.organization_id = v_row.organization_id
   order by i.created_at desc
   limit 1;

  if v_state = 'pending' then
    return 'unchanged';
  elsif v_state = 'approved' then
    v_target := 'approved_internally';
  else
    -- rejected / withdrawn / cancelled / no instance at all: back to draft.
    v_target := 'draft';
  end if;

  update public.agreements
     set status = v_target, updated_at = now()
   where id = v_row.id;

  insert into public.agreement_events (agreement_id, actor_id, event_type, before_state, after_state)
    values (v_row.id, uid, 'status_changed',
            jsonb_build_object('status', 'submitted_for_approval'),
            jsonb_build_object('status', v_target, 'workflow_state', coalesce(v_state, 'missing')));
  return case when v_target = 'approved_internally'
              then 'repaired_approved' else 'repaired_returned' end;
end $$;
revoke all on function public.sync_agreement_approval_v1(uuid) from public;
revoke all on function public.sync_agreement_approval_v1(uuid) from anon;
grant execute on function public.sync_agreement_approval_v1(uuid) to authenticated;

-- 5f. add_agreement_amendment_v1 — append the next amendment record. The
-- base row's document pointer is NEVER rewritten here; the base status
-- moves to 'amended' (record-keeping only).
create or replace function public.add_agreement_amendment_v1(
  p_agreement_id   uuid,
  p_title          text,
  p_description    text,
  p_document_id    text,
  p_effective_date text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid           uuid := auth.uid();
  v_row         public.agreements%rowtype;
  v_title       text := nullif(trim(coalesce(p_title, '')), '');
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_document    uuid;
  v_date        date;
  v_seq         int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.agreements where id = p_agreement_id;
  if v_row.id is null
     or not (public.org_owner_admin_v1(v_row.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.status not in ('approved_internally','active_record','amended') then
    return 'invalid_state';
  end if;
  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 200 then
    return 'invalid';
  end if;
  if v_description is not null and char_length(v_description) > 2000 then
    return 'invalid';
  end if;
  begin
    v_document := nullif(trim(coalesce(p_document_id, '')), '')::uuid;
    v_date     := nullif(trim(coalesce(p_effective_date, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return 'invalid';
  end;
  -- An amendment's document must be an org register entry of the SAME org.
  if v_document is not null and not exists (
       select 1 from public.org_documents od
        where od.id = v_document
          and od.organization_id = v_row.organization_id) then
    return 'invalid';
  end if;

  select coalesce(max(sequence), 0) + 1 into v_seq
    from public.agreement_amendments
   where agreement_id = v_row.id;
  if v_seq > 100 then
    return 'limit_reached';
  end if;

  insert into public.agreement_amendments
      (agreement_id, sequence, title, description, document_id, effective_date, created_by)
    values
      (v_row.id, v_seq, v_title, v_description, v_document, v_date, uid);

  update public.agreements
     set status = 'amended', updated_at = now()
   where id = v_row.id;

  insert into public.agreement_events (agreement_id, actor_id, event_type, before_state, after_state)
    values (v_row.id, uid, 'amended',
            jsonb_build_object('status', v_row.status),
            jsonb_build_object('status', 'amended', 'sequence', v_seq, 'title', v_title));
  return 'amended';
end $$;
revoke all on function public.add_agreement_amendment_v1(uuid, text, text, text, text) from public;
revoke all on function public.add_agreement_amendment_v1(uuid, text, text, text, text) from anon;
grant execute on function public.add_agreement_amendment_v1(uuid, text, text, text, text) to authenticated;

-- 5g. attach_agreement_document_v1 — point the BASE record at its text in
-- the document engine. Allowed while the record is still forming (or while
-- no document was ever attached); later term changes are amendments.
create or replace function public.attach_agreement_document_v1(
  p_agreement_id   uuid,
  p_org_document_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_row public.agreements%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.agreements where id = p_agreement_id;
  if v_row.id is null
     or not (public.org_owner_admin_v1(v_row.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.status in ('terminated_record','expired') then
    return 'not_editable';
  end if;
  -- Amendments carry later term changes; the base pointer is set while the
  -- record is forming, or once if it was never set.
  if v_row.current_document_id is not null
     and v_row.status not in ('draft','submitted_for_approval','approved_internally') then
    return 'not_editable';
  end if;
  if p_org_document_id is null or not exists (
       select 1 from public.org_documents od
        where od.id = p_org_document_id
          and od.organization_id = v_row.organization_id) then
    return 'invalid';
  end if;

  update public.agreements
     set current_document_id = p_org_document_id, updated_at = now()
   where id = v_row.id;

  insert into public.agreement_events (agreement_id, actor_id, event_type, before_state, after_state)
    values (v_row.id, uid, 'updated',
            jsonb_build_object('current_document_id', v_row.current_document_id::text),
            jsonb_build_object('current_document_id', p_org_document_id::text));
  return 'attached';
end $$;
revoke all on function public.attach_agreement_document_v1(uuid, uuid) from public;
revoke all on function public.attach_agreement_document_v1(uuid, uuid) from anon;
grant execute on function public.attach_agreement_document_v1(uuid, uuid) to authenticated;

-- 5h. attach_agreement_signature_evidence_v1 — record that a signature
-- happened OUTSIDE the platform by attaching an evidence file (a registered
-- document_files version of the SAME org's register). This records evidence
-- and claims nothing about legal validity.
create or replace function public.attach_agreement_signature_evidence_v1(
  p_agreement_id      uuid,
  p_document_file_id  uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_row public.agreements%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.agreements where id = p_agreement_id;
  if v_row.id is null
     or not (public.org_owner_admin_v1(v_row.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.status in ('terminated_record','expired') then
    return 'not_editable';
  end if;
  if p_document_file_id is null or not exists (
       select 1
         from public.document_files df
         join public.org_documents od on od.id = df.org_document_id
        where df.id = p_document_file_id
          and df.scope = 'organization'
          and od.organization_id = v_row.organization_id) then
    return 'invalid';
  end if;

  update public.agreements
     set signature_status = 'externally_signed_evidence_attached',
         signature_evidence_file_id = p_document_file_id,
         updated_at = now()
   where id = v_row.id;

  insert into public.agreement_events (agreement_id, actor_id, event_type, before_state, after_state)
    values (v_row.id, uid, 'evidence_attached',
            jsonb_build_object('signature_status', v_row.signature_status),
            jsonb_build_object('signature_status', 'externally_signed_evidence_attached',
                               'document_file_id', p_document_file_id::text));
  return 'evidence_attached';
end $$;
revoke all on function public.attach_agreement_signature_evidence_v1(uuid, uuid) from public;
revoke all on function public.attach_agreement_signature_evidence_v1(uuid, uuid) from anon;
grant execute on function public.attach_agreement_signature_evidence_v1(uuid, uuid) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260817200000_agreements_v1.down.sql
-- restores the prior state exactly (drops the 2 triggers, 2 trigger
-- functions, 9 new functions and 3 new tables; feature-created rows live
-- only in those tables; 0-row guarded). No existing object was touched.
