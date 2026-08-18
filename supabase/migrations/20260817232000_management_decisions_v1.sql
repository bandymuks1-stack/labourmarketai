-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after the lead session's
-- verification. Never `db push`.
-- Gate doc: docs/human-gates/management-decisions-gate.md
-- Rollback:  supabase/rollbacks/20260817232000_management_decisions_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- GRANTs + new RLS-bearing tables + a trigger are RED-class; there is no
-- non-RED way to add a row-level-secured register). Annotation pre-approved
-- by owner mandate 2026-08-17 (autonomous functional completion train V2,
-- §4 migration authority). SAFETY CLASS: RED — 4 new tables, 1 visibility
-- helper + 7 new SECURITY DEFINER commands, 1 append-only trigger guard,
-- EXECUTE grants. ZERO existing table, column, constraint, policy, grant,
-- trigger or function is modified or recreated. ZERO DML at apply time.
-- Prod apply stays manual by the LEAD session.
--
-- 20260817232000 — Management Decisions v1 (a THIN module over the engines).
--
-- PROBLEM (full reality audit 2026-08-17, OPERATIONS): `management
-- decisions` is MISSING. An organization has nowhere to record "this was
-- put to the management team, this is what was decided, this is who is
-- responsible and by when" — even though every mechanism it needs already
-- exists and the workflow engine already reserves the context vocabulary
-- value 'management_decision' (20260817130000, line 122).
--
-- THIN BY CONSTRUCTION — the three things this module does NOT build:
--   1. APPROVAL / VOTING. The EXISTING Workflow & Approval Engine v1 is the
--      only approval machinery. A vote IS an engine step with approval_mode
--      'any' or 'all' over an approver set: 'all' = unanimous, 'any' = first
--      decision carries, 'single' = one named decider. There is NO second
--      voting mechanism, NO tally column, NO ballot table here. This module
--      only MIRRORS the engine's status onto the decision row so the
--      register can be read without joining, and the mirror is only ever
--      written from the engine's own truth (submit verifies a REAL pending
--      instance; sync is idempotent read-repair from the terminal state).
--   2. TASKS. Follow-up work is a REAL `work_tasks` row created through the
--      EXISTING task RPCs from the UI. `decision_task_links` stores a
--      pointer, nothing more — no title, no status, no assignee, no due
--      date is copied. There is no task machinery in this file.
--   3. DOCUMENTS. Agendas, minutes and attachments are EXISTING
--      `org_documents` rows (Document & Evidence Engine v1);
--      `decision_document_links` stores a pointer. No file layer here.
--
-- NAV-GUARD NOTE (audit correction, recorded honestly): the audit row says
-- "nav guard actively excludes it". That evidence was re-checked file by
-- file for this train. The only matching assertion is
-- `apps/web/lib/guards/public-nav-canonical.test.ts` — it bans the value
-- "Sprendimai" from the PUBLIC MARKETING header's `nav.*` labels, where it
-- is the leftover site-template label "Solutions" (paired with "Ištekliai"
-- = "Resources"). It has nothing to do with a management-decisions surface,
-- and it stays exactly as strict as it is. Nothing anywhere named or
-- excluded a decisions surface; the real reason it was missing is that it
-- was never built. This module ships as a SECTION on the EXISTING
-- /dashboard/network surface (beside the approvals section it depends on),
-- so no navigation item, feature flag or frozen nav array is touched.
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   - NO voting/ballot/tally machinery, NO quorum arithmetic.
--   - NO task machinery, NO document/file machinery.
--   - NO notification constraint change (no new event type invented).
--   - NO AI, NO external sending, NO meeting scheduling.
--
-- RLS DECISION, STATED EXPLICITLY:
--   anon:           NOTHING. No grant, no policy.
--   authenticated:  SELECT only, fail-closed —
--     management_decisions / _events / both link tables: the org's
--       governance owner/admin (org_owner_admin_v1), the row's creator, the
--       named responsible person, or platform admin — ONE definer
--       predicate, can_view_management_decision_v1, shared by all four
--       tables. A plain member reads NOTHING: what management is deciding
--       is not org-wide reading material until the organization publishes
--       it as a document, which the document engine already governs.
--     Writes: NO insert/update/delete policy on ANY table and an explicit
--       REVOKE — the 7 gated commands are the only write paths.
--   service_role:   untouched default.
--
-- ROLLBACK: supabase/rollbacks/20260817232000_management_decisions_v1.down.sql
-- refuses while real rows exist (0-row guard), then drops the trigger, 8 new
-- functions and 4 new tables.
-- ============================================================================

begin;

-- ── 0. Safety assertions — the ENGINES this module rides must exist ────────
do $$
begin
  if to_regclass('public.workflow_instances') is null then
    raise exception 'workflow_instances missing — apply 20260817130000_workflow_engine_v1 before this migration';
  end if;
  if to_regclass('public.org_documents') is null then
    raise exception 'org_documents missing — apply 20260817140000_document_file_layer_v1 before this migration';
  end if;
  if to_regclass('public.work_tasks') is null then
    raise exception 'work_tasks missing — apply 20260711210000_work_tasks_v1 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'org_owner_admin_v1'
  ) then
    raise exception 'org_owner_admin_v1 missing — apply 20260817140000 before this migration';
  end if;
end $$;

-- ── 1. Tables ──────────────────────────────────────────────────────────────

-- 1a. The decision record. `status` is a MIRROR of the workflow engine's
-- instance status plus the two states that exist before an instance does
-- ('draft') and after the result is written ('recorded').
create table if not exists public.management_decisions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  title                  text not null check (char_length(trim(title)) >= 3 and char_length(title) <= 160),
  agenda                 text not null check (char_length(trim(agenda)) >= 3 and char_length(agenda) <= 4000),
  decision_result        text check (decision_result is null or char_length(decision_result) <= 4000),
  -- MIRROR of workflow_instances.status; 'draft' and 'recorded' are this
  -- register's own bookends. Never written except from the engine's truth
  -- (submit / sync) or by the two commands that own the bookends.
  status                 text not null default 'draft'
                           check (status in ('draft','submitted_for_approval','approved',
                                             'rejected','withdrawn','cancelled','recorded')),
  workflow_instance_id   uuid references public.workflow_instances(id) on delete set null,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  deadline               date,
  created_by             uuid not null references public.profiles(id) on delete cascade,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- The mirror can only claim an approval state while it names the real
  -- instance the state came from.
  constraint management_decisions_mirror_shape check (
    status in ('draft','recorded')
    or workflow_instance_id is not null
  ),
  -- A result is only recorded once the decision was actually approved.
  constraint management_decisions_result_shape check (
    (decision_result is null and status <> 'recorded')
    or (decision_result is not null and status = 'recorded')
  ),
  constraint management_decisions_instance_uq unique (workflow_instance_id)
);
create index if not exists management_decisions_org_status_idx
  on public.management_decisions (organization_id, status, created_at desc);
create index if not exists management_decisions_responsible_idx
  on public.management_decisions (responsible_profile_id)
  where responsible_profile_id is not null;

comment on column public.management_decisions.status is
  'MIRROR of workflow_instances.status (plus the local bookends draft/recorded). The Workflow & Approval Engine remains the single approval truth; an approval_mode of ''any''/''all'' over a multi-approver step IS the vote — this module implements no voting of its own.';

-- 1b. Pointer to an EXISTING org register document (agenda, minutes,
-- attachment). No file layer here.
create table if not exists public.decision_document_links (
  id              uuid primary key default gen_random_uuid(),
  decision_id     uuid not null references public.management_decisions(id) on delete cascade,
  org_document_id uuid not null references public.org_documents(id) on delete cascade,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  constraint decision_document_links_once unique (decision_id, org_document_id)
);
create index if not exists decision_document_links_decision_idx
  on public.decision_document_links (decision_id, created_at);

-- 1c. Pointer to a REAL work_tasks row. Nothing about the task is copied:
-- title, status, assignee and due date stay the task module's truth.
create table if not exists public.decision_task_links (
  id           uuid primary key default gen_random_uuid(),
  decision_id  uuid not null references public.management_decisions(id) on delete cascade,
  work_task_id uuid not null references public.work_tasks(id) on delete cascade,
  created_by   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  constraint decision_task_links_once unique (decision_id, work_task_id)
);
create index if not exists decision_task_links_decision_idx
  on public.decision_task_links (decision_id, created_at);

comment on table public.decision_task_links is
  'Pointer table ONLY. Follow-up work is a real public.work_tasks row created through the existing task RPCs; no task field is duplicated here.';

-- 1d. Append-only audit ledger.
create table if not exists public.management_decision_events (
  id          uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.management_decisions(id) on delete cascade,
  actor_id    uuid not null references public.profiles(id),
  event_type  text not null check (event_type in
                ('created','updated','submitted','synced','result_recorded',
                 'document_linked','task_linked')),
  from_status text,
  to_status   text,
  metadata    jsonb not null default '{}'::jsonb
                check (pg_column_size(metadata) <= 2048),
  created_at  timestamptz not null default now()
);
create index if not exists management_decision_events_decision_idx
  on public.management_decision_events (decision_id, created_at);

comment on table public.management_decision_events is
  'APPEND-ONLY management decision ledger. Rows are immutable (trigger-enforced for every role incl. service_role).';

-- ── 2. Trigger guard ───────────────────────────────────────────────────────
create or replace function public.management_decision_events_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'management_decision_events is append-only: % is not allowed', tg_op;
end;
$$;
drop trigger if exists management_decision_events_append_only on public.management_decision_events;
create trigger management_decision_events_append_only
  before update or delete on public.management_decision_events
  for each row execute function public.management_decision_events_guard();

-- ── 3. Visibility helper ───────────────────────────────────────────────────
create or replace function public.can_view_management_decision_v1(p_decision_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.management_decisions d
     where d.id = p_decision_id
       and (
         d.created_by = auth.uid()
         or d.responsible_profile_id = auth.uid()
         or public.org_owner_admin_v1(d.organization_id)
         or public.is_admin()
       )
  )
$$;
revoke all on function public.can_view_management_decision_v1(uuid) from public;
revoke all on function public.can_view_management_decision_v1(uuid) from anon;
grant execute on function public.can_view_management_decision_v1(uuid) to authenticated;

-- ── 4. RLS — SELECT-only, fail-closed; writes stay RPC-only ────────────────

alter table public.management_decisions enable row level security;
alter table public.decision_document_links enable row level security;
alter table public.decision_task_links enable row level security;
alter table public.management_decision_events enable row level security;

revoke all on public.management_decisions,
              public.decision_document_links,
              public.decision_task_links,
              public.management_decision_events
  from public;
revoke all on public.management_decisions,
              public.decision_document_links,
              public.decision_task_links,
              public.management_decision_events
  from anon;
revoke all on public.management_decisions,
              public.decision_document_links,
              public.decision_task_links,
              public.management_decision_events
  from authenticated;
grant select on public.management_decisions,
                public.decision_document_links,
                public.decision_task_links,
                public.management_decision_events
  to authenticated;

drop policy if exists management_decisions_select on public.management_decisions;
create policy management_decisions_select on public.management_decisions
  for select to authenticated
  using (public.can_view_management_decision_v1(id));

drop policy if exists decision_document_links_select on public.decision_document_links;
create policy decision_document_links_select on public.decision_document_links
  for select to authenticated
  using (public.can_view_management_decision_v1(decision_id));

drop policy if exists decision_task_links_select on public.decision_task_links;
create policy decision_task_links_select on public.decision_task_links
  for select to authenticated
  using (public.can_view_management_decision_v1(decision_id));

drop policy if exists management_decision_events_select on public.management_decision_events;
create policy management_decision_events_select on public.management_decision_events
  for select to authenticated
  using (public.can_view_management_decision_v1(decision_id));

-- ── 5. Commands (SECURITY DEFINER, outcome-string contract) ────────────────

-- 5a. create_management_decision_v1 — org owner/admin opens the record.
create or replace function public.create_management_decision_v1(
  p_organization_id  text,
  p_title            text,
  p_agenda           text,
  p_responsible_email text default null,
  p_deadline         text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_org     uuid;
  v_title   text := nullif(trim(coalesce(p_title, '')), '');
  v_agenda  text := nullif(left(trim(coalesce(p_agenda, '')), 4000), '');
  v_resp    uuid;
  v_dead    date;
  v_new     uuid;
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
  if not public.org_owner_admin_v1(v_org) and not public.is_admin() then
    return 'not_authorized';
  end if;
  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 160 then
    return 'invalid';
  end if;
  if v_agenda is null or char_length(v_agenda) < 3 then return 'invalid'; end if;
  begin
    v_dead := nullif(trim(coalesce(p_deadline, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow
              or invalid_datetime_format then
    return 'invalid';
  end;

  if nullif(trim(coalesce(p_responsible_email, '')), '') is not null then
    select p.id into v_resp from public.profiles p
     where lower(p.email) = lower(trim(p_responsible_email)) limit 1;
    -- Foreign, missing and non-member addresses all answer the same.
    if v_resp is null or not exists (
      select 1 from public.company_memberships m
       where m.profile_id = v_resp
         and m.organization_id = v_org
         and m.status = 'active'
    ) then
      return 'invalid_responsible';
    end if;
  end if;

  if (select count(*) from public.management_decisions d
       where d.organization_id = v_org and d.status <> 'recorded') >= 500 then
    return 'limit_reached';
  end if;

  insert into public.management_decisions
    (organization_id, title, agenda, responsible_profile_id, deadline, created_by)
  values (v_org, v_title, v_agenda, v_resp, v_dead, uid)
  returning id into v_new;

  insert into public.management_decision_events
    (decision_id, actor_id, event_type, to_status)
  values (v_new, uid, 'created', 'draft');

  return 'created';
end $$;
revoke all on function public.create_management_decision_v1(text, text, text, text, text) from public;
revoke all on function public.create_management_decision_v1(text, text, text, text, text) from anon;
grant execute on function public.create_management_decision_v1(text, text, text, text, text) to authenticated;

-- 5b. update_management_decision_v1 — editable only while still a DRAFT.
create or replace function public.update_management_decision_v1(
  p_decision_id       text,
  p_title             text default null,
  p_agenda            text default null,
  p_responsible_email text default null,
  p_deadline          text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_id     uuid;
  v_title  text := nullif(trim(coalesce(p_title, '')), '');
  v_agenda text := nullif(left(trim(coalesce(p_agenda, '')), 4000), '');
  v_resp   uuid;
  v_dead   date;
  d        public.management_decisions%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_decision_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;
  begin
    v_dead := nullif(trim(coalesce(p_deadline, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow
              or invalid_datetime_format then
    return 'invalid';
  end;

  select * into d from public.management_decisions md where md.id = v_id for update;
  if d.id is null
     or (not public.org_owner_admin_v1(d.organization_id) and not public.is_admin()) then
    return 'not_found';
  end if;
  if d.status <> 'draft' then return 'invalid_state'; end if;

  if v_title is not null and (char_length(v_title) < 3 or char_length(v_title) > 160) then
    return 'invalid';
  end if;
  if v_agenda is not null and char_length(v_agenda) < 3 then return 'invalid'; end if;

  if nullif(trim(coalesce(p_responsible_email, '')), '') is not null then
    select p.id into v_resp from public.profiles p
     where lower(p.email) = lower(trim(p_responsible_email)) limit 1;
    if v_resp is null or not exists (
      select 1 from public.company_memberships m
       where m.profile_id = v_resp
         and m.organization_id = d.organization_id
         and m.status = 'active'
    ) then
      return 'invalid_responsible';
    end if;
  end if;

  update public.management_decisions
     set title                  = coalesce(v_title, title),
         agenda                 = coalesce(v_agenda, agenda),
         responsible_profile_id = coalesce(v_resp, responsible_profile_id),
         deadline               = coalesce(v_dead, deadline),
         updated_at             = now()
   where id = d.id;

  insert into public.management_decision_events
    (decision_id, actor_id, event_type, from_status, to_status)
  values (d.id, uid, 'updated', d.status, d.status);

  return 'updated';
end $$;
revoke all on function public.update_management_decision_v1(text, text, text, text, text) from public;
revoke all on function public.update_management_decision_v1(text, text, text, text, text) from anon;
grant execute on function public.update_management_decision_v1(text, text, text, text, text) to authenticated;

-- 5c. submit_management_decision_v1 — attaches the mirror to a REAL pending
-- workflow instance. It CANNOT invent an approval: the instance must
-- already exist, be pending, belong to the same organization, and carry
-- context_entity_type = 'management_decision' with this decision's id. The
-- app layer starts the instance through the ENGINE'S OWN
-- start_workflow_instance_v1 — never through this function.
create or replace function public.submit_management_decision_v1(
  p_decision_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_id   uuid;
  d      public.management_decisions%rowtype;
  v_inst uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_decision_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select * into d from public.management_decisions md where md.id = v_id for update;
  if d.id is null
     or (not public.org_owner_admin_v1(d.organization_id) and not public.is_admin()) then
    return 'not_found';
  end if;
  if d.status <> 'draft' then return 'invalid_state'; end if;

  select i.id into v_inst
    from public.workflow_instances i
   where i.context_entity_type = 'management_decision'
     and i.context_entity_id = d.id
     and i.organization_id = d.organization_id
     and i.status = 'pending'
   order by i.created_at desc
   limit 1;
  -- No real pending instance → no mirror. The register never claims an
  -- approval that the engine does not hold.
  if v_inst is null then return 'no_instance'; end if;

  update public.management_decisions
     set status = 'submitted_for_approval',
         workflow_instance_id = v_inst,
         updated_at = now()
   where id = d.id;

  insert into public.management_decision_events
    (decision_id, actor_id, event_type, from_status, to_status, metadata)
  values (d.id, uid, 'submitted', d.status, 'submitted_for_approval',
          jsonb_build_object('workflow_instance_id', v_inst::text));

  return 'submitted';
end $$;
revoke all on function public.submit_management_decision_v1(text) from public;
revoke all on function public.submit_management_decision_v1(text) from anon;
grant execute on function public.submit_management_decision_v1(text) to authenticated;

-- 5d. sync_management_decision_v1 — idempotent READ-REPAIR from the engine's
-- terminal truth. It copies workflow_instances.status onto the mirror and
-- does nothing else. It never decides, never approves, never writes an
-- engine row (the agreements sync precedent).
create or replace function public.sync_management_decision_v1(
  p_decision_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_id     uuid;
  d        public.management_decisions%rowtype;
  v_status text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_decision_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select * into d from public.management_decisions md where md.id = v_id for update;
  if d.id is null or not public.can_view_management_decision_v1(d.id) then
    return 'not_found';
  end if;
  if d.workflow_instance_id is null then return 'no_instance'; end if;
  if d.status = 'recorded' then return 'unchanged'; end if;

  select i.status into v_status
    from public.workflow_instances i
   where i.id = d.workflow_instance_id;
  if v_status is null then return 'no_instance'; end if;
  if v_status = 'pending' then v_status := 'submitted_for_approval'; end if;
  if v_status = d.status then return 'unchanged'; end if;

  update public.management_decisions
     set status = v_status, updated_at = now()
   where id = d.id;

  insert into public.management_decision_events
    (decision_id, actor_id, event_type, from_status, to_status)
  values (d.id, uid, 'synced', d.status, v_status);

  return 'synced';
end $$;
revoke all on function public.sync_management_decision_v1(text) from public;
revoke all on function public.sync_management_decision_v1(text) from anon;
grant execute on function public.sync_management_decision_v1(text) to authenticated;

-- 5e. record_management_decision_result_v1 — writes what was decided, ONLY
-- once the engine actually approved it. Fill-once: the recorded outcome of
-- a management decision is not quietly rewritten.
create or replace function public.record_management_decision_result_v1(
  p_decision_id text,
  p_result      text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_id     uuid;
  v_result text := nullif(left(trim(coalesce(p_result, '')), 4000), '');
  d        public.management_decisions%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_decision_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null or v_result is null then return 'invalid'; end if;

  select * into d from public.management_decisions md where md.id = v_id for update;
  if d.id is null
     or (not public.org_owner_admin_v1(d.organization_id) and not public.is_admin()) then
    return 'not_found';
  end if;
  if d.status = 'recorded' then return 'already_recorded'; end if;
  -- The engine must have approved it first — the register never records the
  -- outcome of a decision the approval chain did not carry.
  if d.status <> 'approved' then return 'invalid_state'; end if;

  update public.management_decisions
     set decision_result = v_result, status = 'recorded', updated_at = now()
   where id = d.id;

  insert into public.management_decision_events
    (decision_id, actor_id, event_type, from_status, to_status)
  values (d.id, uid, 'result_recorded', d.status, 'recorded');

  return 'recorded';
end $$;
revoke all on function public.record_management_decision_result_v1(text, text) from public;
revoke all on function public.record_management_decision_result_v1(text, text) from anon;
grant execute on function public.record_management_decision_result_v1(text, text) to authenticated;

-- 5f. attach_decision_document_v1 — links an EXISTING same-org register
-- document. No file is uploaded, copied or stored by this function.
create or replace function public.attach_decision_document_v1(
  p_decision_id     text,
  p_org_document_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_id  uuid;
  v_doc uuid;
  d     public.management_decisions%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id  := nullif(trim(coalesce(p_decision_id, '')), '')::uuid;
    v_doc := nullif(trim(coalesce(p_org_document_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null or v_doc is null then return 'invalid'; end if;

  select * into d from public.management_decisions md where md.id = v_id;
  if d.id is null
     or (not public.org_owner_admin_v1(d.organization_id) and not public.is_admin()) then
    return 'not_found';
  end if;
  if not exists (
    select 1 from public.org_documents od
     where od.id = v_doc and od.organization_id = d.organization_id
  ) then
    return 'invalid_document';
  end if;
  if (select count(*) from public.decision_document_links l
       where l.decision_id = d.id) >= 50 then
    return 'limit_reached';
  end if;

  begin
    insert into public.decision_document_links (decision_id, org_document_id, created_by)
    values (d.id, v_doc, uid);
  exception when unique_violation then
    return 'already_linked';
  end;

  insert into public.management_decision_events
    (decision_id, actor_id, event_type, metadata)
  values (d.id, uid, 'document_linked',
          jsonb_build_object('org_document_id', v_doc::text));

  return 'linked';
end $$;
revoke all on function public.attach_decision_document_v1(text, text) from public;
revoke all on function public.attach_decision_document_v1(text, text) from anon;
grant execute on function public.attach_decision_document_v1(text, text) to authenticated;

-- 5g. link_decision_task_v1 — links a REAL work_tasks row that the caller
-- already created through the EXISTING task RPCs. Nothing about the task is
-- copied; this function creates no task and changes none.
create or replace function public.link_decision_task_v1(
  p_decision_id  text,
  p_work_task_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_id   uuid;
  v_task uuid;
  d      public.management_decisions%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id   := nullif(trim(coalesce(p_decision_id, '')), '')::uuid;
    v_task := nullif(trim(coalesce(p_work_task_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null or v_task is null then return 'invalid'; end if;

  select * into d from public.management_decisions md where md.id = v_id;
  if d.id is null
     or (not public.org_owner_admin_v1(d.organization_id) and not public.is_admin()) then
    return 'not_found';
  end if;
  -- The task must exist AND be one the caller genuinely owns or assigned —
  -- an arbitrary uuid can never be pinned to a management decision.
  if not exists (
    select 1 from public.work_tasks wt
     where wt.id = v_task
       and (wt.created_by = uid or wt.assignee_profile_id = uid)
  ) then
    return 'invalid_task';
  end if;
  if (select count(*) from public.decision_task_links l
       where l.decision_id = d.id) >= 50 then
    return 'limit_reached';
  end if;

  begin
    insert into public.decision_task_links (decision_id, work_task_id, created_by)
    values (d.id, v_task, uid);
  exception when unique_violation then
    return 'already_linked';
  end;

  insert into public.management_decision_events
    (decision_id, actor_id, event_type, metadata)
  values (d.id, uid, 'task_linked',
          jsonb_build_object('work_task_id', v_task::text));

  return 'linked';
end $$;
revoke all on function public.link_decision_task_v1(text, text) from public;
revoke all on function public.link_decision_task_v1(text, text) from anon;
grant execute on function public.link_decision_task_v1(text, text) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260817232000_management_decisions_v1.down.sql
-- refuses while real rows exist (0-row guard), then drops the trigger, 8 new
-- functions and 4 new tables. No existing object was touched, and no
-- workflow/document/task row is ever modified by this module.
