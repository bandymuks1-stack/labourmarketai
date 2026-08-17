-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after the lead session's
-- verification. Never `db push`.
-- Gate doc: docs/human-gates/workflow-engine-gate.md
-- Rollback:  supabase/rollbacks/20260817120000_workflow_engine_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- GRANTs + new RLS-bearing tables + triggers are RED-class; there is no
-- non-RED way to add a row-level-secured write engine). Annotation
-- pre-approved by owner mandate 2026-08-17 (autonomous functional completion
-- train V2, §4 migration authority). SAFETY CLASS: RED — 7 new tables, 12 new
-- functions (8 commands + 3 visibility helpers + 1 internal resolver), 3
-- trigger guards, EXECUTE grants. ZERO existing table, policy, grant,
-- trigger or function is modified or recreated. ZERO DML at apply time.
-- Prod apply stays manual by the LEAD session via Supabase MCP.
--
-- 20260817120000 — canonical Workflow & Approval Engine v1.
--
-- PROBLEM: every approval in the product is a hardcoded, single-step,
-- domain-specific predicate (absence review, booking respond, document
-- verification, journal confirmation, membership commands). There is no way
-- for an organization to define WHO must approve WHAT, in what order, with
-- what deadline — the largest architectural parity gap against workflow-based
-- competitors (Work-OS/Vecticum audit 2026-08-17).
--
-- SOLUTION (one canonical engine, no feature forks):
--   * workflow_definitions / _definition_versions / _version_steps — an org
--     owner/admin authors a reusable approval template; steps are frozen the
--     moment a version is published (trigger-enforced).
--   * workflow_instances / _instance_steps / _instance_approvers — a concrete
--     request: a step snapshot is taken at start, EVERY step's approver set
--     is resolved at start from the step rule (org_role | profiles |
--     requester_manager) over the governance truth (ACTIVE
--     company_memberships) with org-boundary eligibility over BOTH membership
--     truths (company_memberships OR engagement_contexts). Decisions are
--     fill-once (RPC + trigger).
--   * workflow_transitions — append-only, immutable audit trail of every
--     state change (trigger-enforced like the disclosure ledger precedent).
--   * 8 gated SECURITY DEFINER commands are the ONLY write paths (direct
--     insert/update/delete REVOKEd, no write policies).
--
-- CONCURRENCY: decide/delegate/withdraw/cancel take a row lock on the
-- instance (`for update`) so two approvers deciding simultaneously serialize;
-- repeated identical calls are idempotent (outcome strings, no double write).
--
-- ESCALATION IS A SAFE STATE: mark_overdue flips a past-deadline ACTIVE step
-- to 'escalated' and records a transition. It NEVER writes a decision, NEVER
-- approves, NEVER transfers authority — approvers can still decide an
-- escalated step. No AI anywhere in this engine.
--
-- WHAT IS DELIBERATELY NOT ADDED (design doc v1 out-of-scope, binding):
--   - NO auto-approve rules, NO amount-threshold routing;
--   - NO cron/scheduler wiring (the mark-overdue RPC exists; scheduling it is
--     an owner gate);
--   - NO migration of the existing per-domain approvals onto the engine —
--     they keep working untouched this train;
--   - NO external sending of any kind — notifications ride the EXISTING
--     notification_events spine, emitted app-side after the domain write;
--   - NO recreate of ANY existing RPC/trigger/table/policy — every object
--     below is a NEW name.
--
-- RLS DECISION, STATED EXPLICITLY:
--   anon:           NOTHING. No grant, no policy.
--   authenticated:  SELECT only, fail-closed —
--     definitions/versions/steps: active members of the org (either
--       membership truth, via public.belongs_to_organization) or platform
--       admin;
--     instances/instance_steps/approvers/transitions: the requester, a
--       resolved approver (or delegate), the org's governance owner/admin
--       (company_memberships truth via membership_actor_role_v1), or
--       platform admin — ONE definer predicate, workflow_can_view_instance_v1,
--       used by all four tables (assets-recursion-precedent shape).
--     Writes: NO insert/update/delete policy on ANY table and an explicit
--       REVOKE — the 8 gated commands are the only write paths.
--   service_role:   untouched default (no engine-specific widening).
--
-- ROLLBACK: supabase/rollbacks/20260817120000_workflow_engine_v1.down.sql
-- restores the prior state exactly: drops ONLY the 3 triggers, 12 new
-- functions and 7 new tables (feature-created rows live ONLY in those
-- tables). No existing object was touched, so the down file recreates
-- nothing.
-- ============================================================================

begin;

-- ── 0. Safety assertions — the truths this engine builds on must exist ──────
do $$
begin
  if to_regclass('public.company_memberships') is null then
    raise exception 'company_memberships missing — apply 20260806090000 before this migration';
  end if;
  if to_regclass('public.engagement_contexts') is null then
    raise exception 'engagement_contexts missing — this environment predates the employment spine';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'membership_actor_role_v1'
  ) then
    raise exception 'membership_actor_role_v1 missing — apply 20260806120000 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'belongs_to_organization'
  ) then
    raise exception 'belongs_to_organization missing — apply 20260806120000 before this migration';
  end if;
end $$;

-- ── 1. Tables ───────────────────────────────────────────────────────────────

-- 1a. Approval templates (per organization).
create table if not exists public.workflow_definitions (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  slug                text not null check (slug ~ '^[a-z0-9]+(_[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  name                text not null check (char_length(trim(name)) >= 3 and char_length(name) <= 120),
  description         text check (char_length(description) <= 1000),
  context_entity_type text not null default 'generic_request'
                        check (context_entity_type in (
                          'generic_request','worker_absence','expense','invoice','document_ack',
                          'timesheet','procurement','business_trip','management_decision','agreement')),
  is_active           boolean not null default true,
  created_by          uuid not null references public.profiles(id) on delete cascade,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint workflow_definitions_org_slug_uq unique (organization_id, slug)
);
create index if not exists workflow_definitions_org_idx
  on public.workflow_definitions (organization_id);

-- 1b. Versions — a definition's steps are editable ONLY while unpublished.
create table if not exists public.workflow_definition_versions (
  id            uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.workflow_definitions(id) on delete cascade,
  version       int not null check (version >= 1),
  published_at  timestamptz,
  created_by    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  constraint workflow_definition_versions_uq unique (definition_id, version)
);
create index if not exists workflow_definition_versions_def_idx
  on public.workflow_definition_versions (definition_id);

-- 1c. Ordered steps of a version. approver_rule vocabulary (closed):
--   {"kind":"org_role","roles":[governance roles]}
--   {"kind":"profiles","profile_ids":[uuid,...]}
--   {"kind":"requester_manager"}
create table if not exists public.workflow_version_steps (
  id              uuid primary key default gen_random_uuid(),
  version_id      uuid not null references public.workflow_definition_versions(id) on delete cascade,
  step_order      int not null check (step_order between 1 and 20),
  name            text not null check (char_length(trim(name)) >= 2 and char_length(name) <= 120),
  approval_mode   text not null check (approval_mode in ('single','all','any')),
  approver_rule   jsonb not null check (pg_column_size(approver_rule) <= 2048),
  deadline_hours  int check (deadline_hours between 1 and 2160),
  escalation_rule jsonb check (pg_column_size(escalation_rule) <= 1024),
  constraint workflow_version_steps_uq unique (version_id, step_order)
);
create index if not exists workflow_version_steps_version_idx
  on public.workflow_version_steps (version_id);

-- 1d. A concrete request against a PUBLISHED version.
create table if not exists public.workflow_instances (
  id                   uuid primary key default gen_random_uuid(),
  version_id           uuid not null references public.workflow_definition_versions(id) on delete cascade,
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  context_entity_type  text not null
                         check (context_entity_type in (
                           'generic_request','worker_absence','expense','invoice','document_ack',
                           'timesheet','procurement','business_trip','management_decision','agreement')),
  context_entity_id    uuid,
  requester_profile_id uuid not null references public.profiles(id) on delete cascade,
  title                text not null check (char_length(trim(title)) >= 3 and char_length(title) <= 160),
  payload              jsonb not null default '{}'::jsonb check (pg_column_size(payload) <= 8192),
  status               text not null default 'pending'
                         check (status in ('pending','approved','rejected','withdrawn','cancelled')),
  current_step_order   int,
  created_at           timestamptz not null default now(),
  completed_at         timestamptz,
  constraint workflow_instances_completed_shape check (
    (status = 'pending' and completed_at is null)
    or
    (status in ('approved','rejected','withdrawn','cancelled') and completed_at is not null)
  )
);
create index if not exists workflow_instances_org_status_idx
  on public.workflow_instances (organization_id, status);
create index if not exists workflow_instances_requester_idx
  on public.workflow_instances (requester_profile_id, created_at desc);
-- Idempotent starts: at most ONE live instance per external context entity.
create unique index if not exists workflow_instances_active_context_uq
  on public.workflow_instances (context_entity_type, context_entity_id)
  where status = 'pending' and context_entity_id is not null;

-- 1e. Step snapshot per instance (deadline copied at start, stamped when
-- the step activates).
create table if not exists public.workflow_instance_steps (
  id             uuid primary key default gen_random_uuid(),
  instance_id    uuid not null references public.workflow_instances(id) on delete cascade,
  step_order     int not null check (step_order between 1 and 20),
  name           text not null,
  approval_mode  text not null check (approval_mode in ('single','all','any')),
  status         text not null default 'waiting'
                   check (status in ('waiting','active','approved','rejected','skipped','escalated')),
  deadline_hours int check (deadline_hours between 1 and 2160),
  deadline_at    timestamptz,
  activated_at   timestamptz,
  completed_at   timestamptz,
  constraint workflow_instance_steps_uq unique (instance_id, step_order)
);
create index if not exists workflow_instance_steps_instance_idx
  on public.workflow_instance_steps (instance_id, step_order);

-- 1f. Resolved approver slots. instance_id is deliberately denormalized so
-- the SELECT policy needs no policy-time join (assets recursion precedent).
create table if not exists public.workflow_instance_approvers (
  id                      uuid primary key default gen_random_uuid(),
  instance_step_id        uuid not null references public.workflow_instance_steps(id) on delete cascade,
  instance_id             uuid not null references public.workflow_instances(id) on delete cascade,
  approver_profile_id     uuid not null references public.profiles(id) on delete cascade,
  delegated_to_profile_id uuid references public.profiles(id) on delete set null,
  decision                text check (decision in ('approved','rejected')),
  decided_by              uuid references public.profiles(id),
  decided_at              timestamptz,
  reason                  text check (char_length(reason) <= 500),
  constraint workflow_instance_approvers_uq unique (instance_step_id, approver_profile_id),
  constraint workflow_instance_approvers_decided_shape check (
    (decision is null and decided_by is null and decided_at is null)
    or
    (decision is not null and decided_by is not null and decided_at is not null)
  )
);
create index if not exists workflow_instance_approvers_instance_idx
  on public.workflow_instance_approvers (instance_id);
create index if not exists workflow_instance_approvers_open_idx
  on public.workflow_instance_approvers (approver_profile_id)
  where decision is null;
create index if not exists workflow_instance_approvers_delegate_idx
  on public.workflow_instance_approvers (delegated_to_profile_id)
  where decision is null;

-- 1g. Append-only, immutable transition ledger.
create table if not exists public.workflow_transitions (
  id               uuid primary key default gen_random_uuid(),
  instance_id      uuid not null references public.workflow_instances(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id),
  action           text not null check (action in (
                     'started','step_activated','approved','rejected','delegated',
                     'withdrawn','cancelled','escalated','completed')),
  step_order       int,
  from_status      text,
  to_status        text,
  reason           text check (char_length(reason) <= 500),
  metadata         jsonb not null default '{}'::jsonb check (pg_column_size(metadata) <= 2048),
  created_at       timestamptz not null default now()
);
create index if not exists workflow_transitions_instance_idx
  on public.workflow_transitions (instance_id, created_at);

comment on table public.workflow_transitions is
  'APPEND-ONLY workflow audit ledger. Rows are immutable (trigger-enforced for every role incl. service_role). Every engine state change writes exactly here.';

-- ── 2. Immutability / fill-once trigger guards ──────────────────────────────

-- 2a. Transitions are append-only forever.
create or replace function public.workflow_transitions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'workflow_transitions is append-only: % is not allowed', tg_op;
end;
$$;
drop trigger if exists workflow_transitions_append_only on public.workflow_transitions;
create trigger workflow_transitions_append_only
  before update or delete on public.workflow_transitions
  for each row execute function public.workflow_transitions_guard();

-- 2b. Approver decisions fill exactly once; identity columns never move.
create or replace function public.workflow_approver_fill_once_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.instance_step_id is distinct from old.instance_step_id
    or new.instance_id is distinct from old.instance_id
    or new.approver_profile_id is distinct from old.approver_profile_id
  then
    raise exception 'workflow approver slot identity is immutable';
  end if;
  if old.decision is not null then
    raise exception 'workflow approver decision is fill-once: a decided slot is immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists workflow_approvers_fill_once on public.workflow_instance_approvers;
create trigger workflow_approvers_fill_once
  before update on public.workflow_instance_approvers
  for each row execute function public.workflow_approver_fill_once_guard();

-- 2c. Steps of a PUBLISHED version are frozen (insert/update/delete alike).
create or replace function public.workflow_version_steps_frozen_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_version uuid := coalesce(new.version_id, old.version_id);
begin
  if exists (
    select 1 from public.workflow_definition_versions v
     where v.id = v_version and v.published_at is not null
  ) then
    raise exception 'workflow version is published: its steps are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
drop trigger if exists workflow_version_steps_frozen on public.workflow_version_steps;
create trigger workflow_version_steps_frozen
  before insert or update or delete on public.workflow_version_steps
  for each row execute function public.workflow_version_steps_frozen_guard();

-- ── 3. Visibility helpers (SECURITY DEFINER, recursion-free policies) ──────

-- 3a. Who may read a definition: active org member (either truth) or admin.
create or replace function public.workflow_can_view_definition_v1(p_definition_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.workflow_definitions d
     where d.id = p_definition_id
       and (public.belongs_to_organization(d.organization_id) or public.is_admin())
  )
$$;
revoke all on function public.workflow_can_view_definition_v1(uuid) from public;
revoke all on function public.workflow_can_view_definition_v1(uuid) from anon;
grant execute on function public.workflow_can_view_definition_v1(uuid) to authenticated;

-- 3b. Same predicate one hop up (steps → version → definition).
create or replace function public.workflow_can_view_version_v1(p_version_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.workflow_definition_versions v
      join public.workflow_definitions d on d.id = v.definition_id
     where v.id = p_version_id
       and (public.belongs_to_organization(d.organization_id) or public.is_admin())
  )
$$;
revoke all on function public.workflow_can_view_version_v1(uuid) from public;
revoke all on function public.workflow_can_view_version_v1(uuid) from anon;
grant execute on function public.workflow_can_view_version_v1(uuid) to authenticated;

-- 3c. THE instance visibility predicate: requester, resolved approver (or
-- delegate), org governance owner/admin, or platform admin. Definer, so the
-- four instance-family policies can call it without policy recursion.
create or replace function public.workflow_can_view_instance_v1(p_instance_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.workflow_instances i
     where i.id = p_instance_id
       and (
         i.requester_profile_id = auth.uid()
         or public.is_admin()
         or coalesce(public.membership_actor_role_v1(auth.uid(), i.organization_id), '') in ('owner','admin')
         or exists (
           select 1 from public.workflow_instance_approvers a
            where a.instance_id = i.id
              and (a.approver_profile_id = auth.uid() or a.delegated_to_profile_id = auth.uid())
         )
       )
  )
$$;
revoke all on function public.workflow_can_view_instance_v1(uuid) from public;
revoke all on function public.workflow_can_view_instance_v1(uuid) from anon;
grant execute on function public.workflow_can_view_instance_v1(uuid) to authenticated;

-- 3d. INTERNAL approver-set resolver (no grants at all — SQL-internal, the
-- membership_actor_role_v1 precedent). Governance truth = ACTIVE
-- company_memberships; 'profiles' eligibility = BOTH membership truths.
create or replace function public.workflow_resolve_step_approvers_v1(
  p_organization_id uuid,
  p_requester       uuid,
  p_rule            jsonb
) returns setof uuid
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_kind text := p_rule->>'kind';
begin
  if v_kind = 'org_role' then
    return query
      select distinct m.profile_id
        from public.company_memberships m
       where m.organization_id = p_organization_id
         and m.status = 'active'
         and m.role in (select jsonb_array_elements_text(p_rule->'roles'));
  elsif v_kind = 'profiles' then
    return query
      select distinct pid
        from (
          select (jsonb_array_elements_text(p_rule->'profile_ids'))::uuid as pid
        ) ids
       where exists (
               select 1 from public.company_memberships m
                where m.profile_id = ids.pid
                  and m.organization_id = p_organization_id
                  and m.status = 'active'
             )
          or exists (
               select 1 from public.engagement_contexts ec
                where ec.profile_id = ids.pid
                  and ec.organization_id = p_organization_id
                  and ec.status = 'active'
             );
  elsif v_kind = 'requester_manager' then
    -- The requester's managers inside THIS org, read from the governance
    -- truth: every active membership holding a managing role, minus the
    -- requester themselves (no self-approval by rule construction).
    return query
      select distinct m.profile_id
        from public.company_memberships m
       where m.organization_id = p_organization_id
         and m.status = 'active'
         and m.role in ('owner','admin','manager','external_manager')
         and m.profile_id <> p_requester;
  end if;
  return;
end;
$$;
revoke all on function public.workflow_resolve_step_approvers_v1(uuid, uuid, jsonb) from public;
revoke all on function public.workflow_resolve_step_approvers_v1(uuid, uuid, jsonb) from anon;
revoke all on function public.workflow_resolve_step_approvers_v1(uuid, uuid, jsonb) from authenticated;

-- ── 4. RLS — SELECT-only, fail-closed; writes stay RPC-only ────────────────

alter table public.workflow_definitions enable row level security;
alter table public.workflow_definition_versions enable row level security;
alter table public.workflow_version_steps enable row level security;
alter table public.workflow_instances enable row level security;
alter table public.workflow_instance_steps enable row level security;
alter table public.workflow_instance_approvers enable row level security;
alter table public.workflow_transitions enable row level security;

-- Default-closed grants first, then exactly SELECT back.
revoke all on public.workflow_definitions,
              public.workflow_definition_versions,
              public.workflow_version_steps,
              public.workflow_instances,
              public.workflow_instance_steps,
              public.workflow_instance_approvers,
              public.workflow_transitions
  from public;
revoke all on public.workflow_definitions,
              public.workflow_definition_versions,
              public.workflow_version_steps,
              public.workflow_instances,
              public.workflow_instance_steps,
              public.workflow_instance_approvers,
              public.workflow_transitions
  from anon;
revoke all on public.workflow_definitions,
              public.workflow_definition_versions,
              public.workflow_version_steps,
              public.workflow_instances,
              public.workflow_instance_steps,
              public.workflow_instance_approvers,
              public.workflow_transitions
  from authenticated;
grant select on public.workflow_definitions,
                public.workflow_definition_versions,
                public.workflow_version_steps,
                public.workflow_instances,
                public.workflow_instance_steps,
                public.workflow_instance_approvers,
                public.workflow_transitions
  to authenticated;

drop policy if exists workflow_definitions_select on public.workflow_definitions;
create policy workflow_definitions_select on public.workflow_definitions
  for select to authenticated
  using (public.belongs_to_organization(organization_id) or public.is_admin());

drop policy if exists workflow_definition_versions_select on public.workflow_definition_versions;
create policy workflow_definition_versions_select on public.workflow_definition_versions
  for select to authenticated
  using (public.workflow_can_view_definition_v1(definition_id));

drop policy if exists workflow_version_steps_select on public.workflow_version_steps;
create policy workflow_version_steps_select on public.workflow_version_steps
  for select to authenticated
  using (public.workflow_can_view_version_v1(version_id));

drop policy if exists workflow_instances_select on public.workflow_instances;
create policy workflow_instances_select on public.workflow_instances
  for select to authenticated
  using (public.workflow_can_view_instance_v1(id));

drop policy if exists workflow_instance_steps_select on public.workflow_instance_steps;
create policy workflow_instance_steps_select on public.workflow_instance_steps
  for select to authenticated
  using (public.workflow_can_view_instance_v1(instance_id));

drop policy if exists workflow_instance_approvers_select on public.workflow_instance_approvers;
create policy workflow_instance_approvers_select on public.workflow_instance_approvers
  for select to authenticated
  using (public.workflow_can_view_instance_v1(instance_id));

drop policy if exists workflow_transitions_select on public.workflow_transitions;
create policy workflow_transitions_select on public.workflow_transitions
  for select to authenticated
  using (public.workflow_can_view_instance_v1(instance_id));

-- No insert/update/delete policy anywhere: with the explicit REVOKE above,
-- the commands below are the ONLY write paths.

-- ── 5. Commands (SECURITY DEFINER, outcome-string contract) ────────────────

-- 5a. create_workflow_definition_v1 — org owner/admin authors a template.
-- p_steps: jsonb array, 1..20 items:
--   { "name": text, "approval_mode": 'single'|'all'|'any',
--     "approver_rule": {...closed vocab...},
--     "deadline_hours": int?, "escalation_rule": {...}? }
create or replace function public.create_workflow_definition_v1(
  p_organization_id     text,
  p_name                text,
  p_slug                text,
  p_context_entity_type text,
  p_steps               jsonb
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_org      uuid;
  v_name     text := nullif(trim(coalesce(p_name, '')), '');
  v_slug     text := lower(nullif(trim(coalesce(p_slug, '')), ''));
  v_ctx      text := nullif(trim(coalesce(p_context_entity_type, '')), '');
  actor_role text;
  v_def      uuid;
  v_ver      uuid;
  v_step     jsonb;
  v_i        int := 0;
  v_mode     text;
  v_rule     jsonb;
  v_kind     text;
  v_dl       int;
  v_esc      jsonb;
  v_r        text;
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

  -- Merged outcome for "org missing" and "no authority" — no oracle.
  actor_role := public.membership_actor_role_v1(uid, v_org);
  if actor_role is null or actor_role not in ('owner','admin') then
    return 'not_authorized';
  end if;

  if v_name is null or char_length(v_name) < 3 or char_length(v_name) > 120 then
    return 'invalid';
  end if;
  if v_slug is null or v_slug !~ '^[a-z0-9]+(_[a-z0-9]+)*$' or char_length(v_slug) > 60 or char_length(v_slug) < 2 then
    return 'invalid';
  end if;
  if v_ctx is null or v_ctx not in (
    'generic_request','worker_absence','expense','invoice','document_ack',
    'timesheet','procurement','business_trip','management_decision','agreement') then
    return 'invalid';
  end if;

  if p_steps is null or jsonb_typeof(p_steps) <> 'array'
     or jsonb_array_length(p_steps) < 1 or jsonb_array_length(p_steps) > 20 then
    return 'invalid';
  end if;

  -- Validate every step BEFORE any write.
  for v_step in select * from jsonb_array_elements(p_steps) loop
    if jsonb_typeof(v_step) <> 'object' then return 'invalid'; end if;
    if nullif(trim(coalesce(v_step->>'name', '')), '') is null
       or char_length(trim(v_step->>'name')) < 2
       or char_length(v_step->>'name') > 120 then
      return 'invalid';
    end if;
    v_mode := v_step->>'approval_mode';
    if v_mode is null or v_mode not in ('single','all','any') then return 'invalid'; end if;
    v_rule := v_step->'approver_rule';
    if v_rule is null or jsonb_typeof(v_rule) <> 'object' then return 'invalid'; end if;
    v_kind := v_rule->>'kind';
    if v_kind = 'org_role' then
      if jsonb_typeof(v_rule->'roles') <> 'array' or jsonb_array_length(v_rule->'roles') < 1 then
        return 'invalid';
      end if;
      for v_r in select jsonb_array_elements_text(v_rule->'roles') loop
        if v_r not in ('owner','admin','manager','external_manager','member') then
          return 'invalid';
        end if;
      end loop;
    elsif v_kind = 'profiles' then
      if jsonb_typeof(v_rule->'profile_ids') <> 'array'
         or jsonb_array_length(v_rule->'profile_ids') < 1
         or jsonb_array_length(v_rule->'profile_ids') > 20 then
        return 'invalid';
      end if;
      begin
        perform (jsonb_array_elements_text(v_rule->'profile_ids'))::uuid;
      exception when invalid_text_representation then
        return 'invalid';
      end;
    elsif v_kind = 'requester_manager' then
      null; -- no extra fields
    else
      return 'invalid';
    end if;
    if v_step ? 'deadline_hours' and jsonb_typeof(v_step->'deadline_hours') <> 'null' then
      begin
        v_dl := (v_step->>'deadline_hours')::int;
      exception when others then
        return 'invalid';
      end;
      if v_dl < 1 or v_dl > 2160 then return 'invalid'; end if;
    end if;
    v_esc := v_step->'escalation_rule';
    if v_esc is not null and jsonb_typeof(v_esc) = 'object' then
      -- v1 closed vocabulary: mark + notify only. NEVER an approve action.
      if coalesce(v_esc->>'action', '') <> 'mark_escalated' then return 'invalid'; end if;
      if v_esc ? 'notify_roles' then
        if jsonb_typeof(v_esc->'notify_roles') <> 'array' then return 'invalid'; end if;
        for v_r in select jsonb_array_elements_text(v_esc->'notify_roles') loop
          if v_r not in ('owner','admin','manager','external_manager') then
            return 'invalid';
          end if;
        end loop;
      end if;
    elsif v_esc is not null and jsonb_typeof(v_esc) <> 'null' then
      return 'invalid';
    end if;
  end loop;

  -- Abuse cap: a template catalogue is a short list, not a data dump.
  if (select count(*) from public.workflow_definitions d
       where d.organization_id = v_org) >= 50 then
    return 'limit_reached';
  end if;

  if exists (select 1 from public.workflow_definitions d
              where d.organization_id = v_org and d.slug = v_slug) then
    return 'already_exists';
  end if;

  insert into public.workflow_definitions
    (organization_id, slug, name, context_entity_type, created_by)
  values (v_org, v_slug, v_name, v_ctx, uid)
  returning id into v_def;

  insert into public.workflow_definition_versions (definition_id, version, created_by)
  values (v_def, 1, uid)
  returning id into v_ver;

  v_i := 0;
  for v_step in select * from jsonb_array_elements(p_steps) loop
    v_i := v_i + 1;
    insert into public.workflow_version_steps
      (version_id, step_order, name, approval_mode, approver_rule, deadline_hours, escalation_rule)
    values
      (v_ver, v_i, trim(v_step->>'name'), v_step->>'approval_mode', v_step->'approver_rule',
       case when v_step ? 'deadline_hours' and jsonb_typeof(v_step->'deadline_hours') <> 'null'
            then (v_step->>'deadline_hours')::int else null end,
       case when jsonb_typeof(v_step->'escalation_rule') = 'object'
            then v_step->'escalation_rule' else null end);
  end loop;

  return 'created';
end;
$$;
revoke all on function public.create_workflow_definition_v1(text, text, text, text, jsonb) from public;
revoke all on function public.create_workflow_definition_v1(text, text, text, text, jsonb) from anon;
grant execute on function public.create_workflow_definition_v1(text, text, text, text, jsonb) to authenticated;

-- 5b. publish_workflow_version_v1 — freezes the steps (trigger enforces it).
create or replace function public.publish_workflow_version_v1(
  p_version_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_ver      uuid;
  v_row      record;
  actor_role text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_ver := nullif(trim(coalesce(p_version_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_ver is null then return 'invalid'; end if;

  select v.id, v.published_at, d.organization_id
    into v_row
    from public.workflow_definition_versions v
    join public.workflow_definitions d on d.id = v.definition_id
   where v.id = v_ver;
  if v_row.id is null then return 'not_found'; end if;

  actor_role := public.membership_actor_role_v1(uid, v_row.organization_id);
  if actor_role is null or actor_role not in ('owner','admin') then
    return 'not_found';  -- merged with missing — no oracle
  end if;

  if v_row.published_at is not null then return 'already_published'; end if;
  if not exists (select 1 from public.workflow_version_steps s where s.version_id = v_ver) then
    return 'invalid';
  end if;

  update public.workflow_definition_versions
     set published_at = now()
   where id = v_ver and published_at is null;

  return 'published';
end;
$$;
revoke all on function public.publish_workflow_version_v1(text) from public;
revoke all on function public.publish_workflow_version_v1(text) from anon;
grant execute on function public.publish_workflow_version_v1(text) to authenticated;

-- 5c. start_workflow_instance_v1 — a member files a request.
-- Returns the new instance id (uuid-as-text) on success; a short outcome
-- string otherwise. The TS layer distinguishes by UUID shape.
create or replace function public.start_workflow_instance_v1(
  p_definition_id     text,
  p_title             text,
  p_payload           jsonb,
  p_context_entity_id text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_def_id  uuid;
  v_ctx_id  uuid;
  v_title   text := nullif(trim(coalesce(p_title, '')), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_def     record;
  v_ver     record;
  v_step    record;
  v_inst    uuid;
  v_step_id uuid;
  v_n       int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_def_id := nullif(trim(coalesce(p_definition_id, '')), '')::uuid;
    v_ctx_id := nullif(trim(coalesce(p_context_entity_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_def_id is null then return 'invalid'; end if;
  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 160 then
    return 'invalid';
  end if;
  if jsonb_typeof(v_payload) <> 'object' or pg_column_size(v_payload) > 8192 then
    return 'invalid';
  end if;

  select d.id, d.organization_id, d.context_entity_type, d.is_active
    into v_def
    from public.workflow_definitions d
   where d.id = v_def_id;
  -- Merged: missing definition and non-member answer the same — no oracle.
  if v_def.id is null
     or not (public.belongs_to_organization(v_def.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if not v_def.is_active then return 'not_found'; end if;

  select v.id into v_ver
    from public.workflow_definition_versions v
   where v.definition_id = v_def.id and v.published_at is not null
   order by v.version desc
   limit 1;
  if v_ver.id is null then return 'not_published'; end if;

  -- Idempotent starts on an external context entity.
  if v_ctx_id is not null and exists (
    select 1 from public.workflow_instances i
     where i.context_entity_type = v_def.context_entity_type
       and i.context_entity_id = v_ctx_id
       and i.status = 'pending'
  ) then
    return 'already_pending';
  end if;

  -- Abuse cap: open requests per requester.
  if (select count(*) from public.workflow_instances i
       where i.requester_profile_id = uid and i.status = 'pending') >= 100 then
    return 'limit_reached';
  end if;

  -- EVERY step must resolve to at least one approver at start (design rule:
  -- approver sets are resolved at instance start; an unapprovable request is
  -- refused, never auto-approved).
  for v_step in
    select s.step_order, s.approver_rule
      from public.workflow_version_steps s
     where s.version_id = v_ver.id
     order by s.step_order
  loop
    select count(*) into v_n
      from public.workflow_resolve_step_approvers_v1(v_def.organization_id, uid, v_step.approver_rule);
    if v_n = 0 then
      return 'no_approvers';
    end if;
  end loop;

  begin
    insert into public.workflow_instances
      (version_id, organization_id, context_entity_type, context_entity_id,
       requester_profile_id, title, payload, status, current_step_order)
    values
      (v_ver.id, v_def.organization_id, v_def.context_entity_type, v_ctx_id,
       uid, v_title, v_payload, 'pending', 1)
    returning id into v_inst;
  exception when unique_violation then
    return 'already_pending';
  end;

  for v_step in
    select s.step_order, s.name, s.approval_mode, s.approver_rule, s.deadline_hours
      from public.workflow_version_steps s
     where s.version_id = v_ver.id
     order by s.step_order
  loop
    insert into public.workflow_instance_steps
      (instance_id, step_order, name, approval_mode, status, deadline_hours,
       deadline_at, activated_at)
    values
      (v_inst, v_step.step_order, v_step.name, v_step.approval_mode,
       case when v_step.step_order = 1 then 'active' else 'waiting' end,
       v_step.deadline_hours,
       case when v_step.step_order = 1 and v_step.deadline_hours is not null
            then now() + make_interval(hours => v_step.deadline_hours) else null end,
       case when v_step.step_order = 1 then now() else null end)
    returning id into v_step_id;

    insert into public.workflow_instance_approvers
      (instance_step_id, instance_id, approver_profile_id)
    select v_step_id, v_inst, r
      from public.workflow_resolve_step_approvers_v1(v_def.organization_id, uid, v_step.approver_rule) r;
  end loop;

  insert into public.workflow_transitions
    (instance_id, actor_profile_id, action, step_order, from_status, to_status)
  values
    (v_inst, uid, 'started', null, null, 'pending'),
    (v_inst, uid, 'step_activated', 1, null, 'active');

  return v_inst::text;
end;
$$;
revoke all on function public.start_workflow_instance_v1(text, text, jsonb, text) from public;
revoke all on function public.start_workflow_instance_v1(text, text, jsonb, text) from anon;
grant execute on function public.start_workflow_instance_v1(text, text, jsonb, text) to authenticated;

-- 5d. decide_workflow_step_v1 — an approver (or delegate) decides once.
-- Row-locks the instance; repeated calls are idempotent; the decision fills
-- exactly once; mode evaluation:
--   single: the first decision completes the step with that outcome;
--   any:    the first decision completes the step (an approval approves, a
--           rejection rejects);
--   all:    one rejection rejects; approval completes only when every slot
--           has approved (otherwise the call records and returns).
create or replace function public.decide_workflow_step_v1(
  p_instance_id text,
  p_decision    text,
  p_reason      text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_inst_id  uuid;
  v_decision text := nullif(trim(coalesce(p_decision, '')), '');
  v_reason   text := nullif(left(coalesce(p_reason, ''), 500), '');
  v_inst     record;
  v_step     record;
  v_slot     record;
  v_total    int;
  v_approved int;
  v_outcome  text;
  v_next     record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_inst_id := nullif(trim(coalesce(p_instance_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_inst_id is null then return 'invalid'; end if;
  if v_decision is null or v_decision not in ('approved','rejected') then
    return 'invalid';
  end if;

  -- Serialize concurrent decisions on the same instance.
  select i.id, i.status, i.current_step_order, i.organization_id
    into v_inst
    from public.workflow_instances i
   where i.id = v_inst_id
   for update;
  if v_inst.id is null then return 'not_found'; end if;

  if v_inst.status <> 'pending' then
    -- Idempotent repeat after completion: a caller whose slot is already
    -- decided hears that; anyone else hears the terminal state.
    if exists (
      select 1 from public.workflow_instance_approvers a
        join public.workflow_instance_steps s on s.id = a.instance_step_id
       where a.instance_id = v_inst.id
         and (a.approver_profile_id = uid or a.delegated_to_profile_id = uid)
         and a.decision is not null
    ) then
      return 'already_decided';
    end if;
    return 'not_pending';
  end if;

  select s.id, s.step_order, s.approval_mode, s.status
    into v_step
    from public.workflow_instance_steps s
   where s.instance_id = v_inst.id
     and s.step_order = v_inst.current_step_order
     and s.status in ('active','escalated');
  if v_step.id is null then return 'not_pending'; end if;

  -- The caller's own slot on the CURRENT step (approver or delegate).
  select a.id, a.decision
    into v_slot
    from public.workflow_instance_approvers a
   where a.instance_step_id = v_step.id
     and (a.approver_profile_id = uid or a.delegated_to_profile_id = uid)
   limit 1;
  -- Merged: no slot and no row answer the same — no oracle.
  if v_slot.id is null then return 'not_found'; end if;
  if v_slot.decision is not null then return 'already_decided'; end if;

  -- Fill exactly once (the trigger guard enforces the same rule).
  update public.workflow_instance_approvers
     set decision = v_decision,
         decided_by = uid,
         decided_at = now(),
         reason = v_reason
   where id = v_slot.id and decision is null;

  insert into public.workflow_transitions
    (instance_id, actor_profile_id, action, step_order, from_status, to_status, reason)
  values
    (v_inst.id, uid, v_decision, v_step.step_order, v_step.status, v_step.status, v_reason);

  -- Evaluate the step under its mode.
  select count(*),
         count(*) filter (where a.decision = 'approved')
    into v_total, v_approved
    from public.workflow_instance_approvers a
   where a.instance_step_id = v_step.id;

  if v_step.approval_mode in ('single','any') then
    v_outcome := v_decision;
  else -- 'all'
    if v_decision = 'rejected' then
      v_outcome := 'rejected';
    elsif v_approved = v_total then
      v_outcome := 'approved';
    else
      return 'recorded';
    end if;
  end if;

  if v_outcome = 'rejected' then
    update public.workflow_instance_steps
       set status = 'rejected', completed_at = now()
     where id = v_step.id;
    update public.workflow_instance_steps
       set status = 'skipped', completed_at = now()
     where instance_id = v_inst.id and status = 'waiting';
    update public.workflow_instances
       set status = 'rejected', completed_at = now(), current_step_order = null
     where id = v_inst.id;
    insert into public.workflow_transitions
      (instance_id, actor_profile_id, action, step_order, from_status, to_status, reason)
    values
      (v_inst.id, uid, 'rejected', v_step.step_order, 'pending', 'rejected', v_reason);
    return 'rejected';
  end if;

  -- Step approved.
  update public.workflow_instance_steps
     set status = 'approved', completed_at = now()
   where id = v_step.id;

  select s.id, s.step_order, s.deadline_hours
    into v_next
    from public.workflow_instance_steps s
   where s.instance_id = v_inst.id and s.status = 'waiting'
   order by s.step_order
   limit 1;

  if v_next.id is null then
    update public.workflow_instances
       set status = 'approved', completed_at = now(), current_step_order = null
     where id = v_inst.id;
    insert into public.workflow_transitions
      (instance_id, actor_profile_id, action, step_order, from_status, to_status)
    values
      (v_inst.id, uid, 'completed', v_step.step_order, 'pending', 'approved');
    return 'approved';
  end if;

  update public.workflow_instance_steps
     set status = 'active',
         activated_at = now(),
         deadline_at = case when v_next.deadline_hours is not null
                            then now() + make_interval(hours => v_next.deadline_hours)
                            else null end
   where id = v_next.id;
  update public.workflow_instances
     set current_step_order = v_next.step_order
   where id = v_inst.id;
  insert into public.workflow_transitions
    (instance_id, actor_profile_id, action, step_order, from_status, to_status)
  values
    (v_inst.id, uid, 'step_activated', v_next.step_order, 'waiting', 'active');

  return 'step_approved';
end;
$$;
revoke all on function public.decide_workflow_step_v1(text, text, text) from public;
revoke all on function public.decide_workflow_step_v1(text, text, text) from anon;
grant execute on function public.decide_workflow_step_v1(text, text, text) to authenticated;

-- 5e. delegate_workflow_step_v1 — an approver hands their UNDECIDED slot to
-- a same-org colleague, addressed by email (membership_invite_v1 precedent:
-- the definer resolves the address; foreign/missing/non-member answer the
-- same outcome — no account oracle). The original approver stays on the
-- slot and stays accountable in the ledger.
create or replace function public.delegate_workflow_step_v1(
  p_instance_id text,
  p_to_email    text,
  p_reason      text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_inst_id uuid;
  v_reason  text := nullif(left(coalesce(p_reason, ''), 500), '');
  v_inst    record;
  v_step    record;
  v_slot    record;
  v_target  uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_inst_id := nullif(trim(coalesce(p_instance_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_inst_id is null then return 'invalid'; end if;
  if nullif(trim(coalesce(p_to_email, '')), '') is null then return 'invalid'; end if;

  select i.id, i.status, i.current_step_order, i.organization_id
    into v_inst
    from public.workflow_instances i
   where i.id = v_inst_id
   for update;
  if v_inst.id is null then return 'not_found'; end if;
  if v_inst.status <> 'pending' then return 'not_pending'; end if;

  select s.id, s.step_order
    into v_step
    from public.workflow_instance_steps s
   where s.instance_id = v_inst.id
     and s.step_order = v_inst.current_step_order
     and s.status in ('active','escalated');
  if v_step.id is null then return 'not_pending'; end if;

  -- Only the ORIGINAL approver may delegate their own undecided slot.
  select a.id, a.decision
    into v_slot
    from public.workflow_instance_approvers a
   where a.instance_step_id = v_step.id
     and a.approver_profile_id = uid
   limit 1;
  if v_slot.id is null then return 'not_found'; end if;
  if v_slot.decision is not null then return 'already_decided'; end if;

  select p.id into v_target from public.profiles p
   where lower(p.email) = lower(trim(p_to_email)) limit 1;
  -- Foreign, missing and non-member addresses all answer the same.
  if v_target is null or v_target = uid then return 'invalid_delegate'; end if;
  if not exists (
       select 1 from public.company_memberships m
        where m.profile_id = v_target
          and m.organization_id = v_inst.organization_id
          and m.status = 'active'
     )
     and not exists (
       select 1 from public.engagement_contexts ec
        where ec.profile_id = v_target
          and ec.organization_id = v_inst.organization_id
          and ec.status = 'active'
     ) then
    return 'invalid_delegate';
  end if;

  update public.workflow_instance_approvers
     set delegated_to_profile_id = v_target
   where id = v_slot.id and decision is null;

  insert into public.workflow_transitions
    (instance_id, actor_profile_id, action, step_order, from_status, to_status, reason, metadata)
  values
    (v_inst.id, uid, 'delegated', v_step.step_order, null, null, v_reason,
     jsonb_build_object('delegated_to_profile_id', v_target::text));

  return 'delegated';
end;
$$;
revoke all on function public.delegate_workflow_step_v1(text, text, text) from public;
revoke all on function public.delegate_workflow_step_v1(text, text, text) from anon;
grant execute on function public.delegate_workflow_step_v1(text, text, text) to authenticated;

-- 5f. withdraw_workflow_instance_v1 — the requester takes their request back.
create or replace function public.withdraw_workflow_instance_v1(
  p_instance_id text,
  p_reason      text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_inst_id uuid;
  v_reason  text := nullif(left(coalesce(p_reason, ''), 500), '');
  v_inst    record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_inst_id := nullif(trim(coalesce(p_instance_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_inst_id is null then return 'invalid'; end if;

  select i.id, i.status, i.requester_profile_id
    into v_inst
    from public.workflow_instances i
   where i.id = v_inst_id
   for update;
  -- Merged: missing row and someone else's request answer the same.
  if v_inst.id is null or v_inst.requester_profile_id <> uid then
    return 'not_found';
  end if;
  if v_inst.status <> 'pending' then return 'not_pending'; end if;

  update public.workflow_instance_steps
     set status = 'skipped', completed_at = now()
   where instance_id = v_inst.id and status in ('waiting','active','escalated');
  update public.workflow_instances
     set status = 'withdrawn', completed_at = now(), current_step_order = null
   where id = v_inst.id;
  insert into public.workflow_transitions
    (instance_id, actor_profile_id, action, from_status, to_status, reason)
  values
    (v_inst.id, uid, 'withdrawn', 'pending', 'withdrawn', v_reason);

  return 'withdrawn';
end;
$$;
revoke all on function public.withdraw_workflow_instance_v1(text, text) from public;
revoke all on function public.withdraw_workflow_instance_v1(text, text) from anon;
grant execute on function public.withdraw_workflow_instance_v1(text, text) to authenticated;

-- 5g. cancel_workflow_instance_v1 — org governance owner/admin (or platform
-- admin) cancels a pending request.
create or replace function public.cancel_workflow_instance_v1(
  p_instance_id text,
  p_reason      text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_inst_id  uuid;
  v_reason   text := nullif(left(coalesce(p_reason, ''), 500), '');
  v_inst     record;
  actor_role text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_inst_id := nullif(trim(coalesce(p_instance_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_inst_id is null then return 'invalid'; end if;

  select i.id, i.status, i.organization_id
    into v_inst
    from public.workflow_instances i
   where i.id = v_inst_id
   for update;
  if v_inst.id is null then return 'not_found'; end if;

  actor_role := public.membership_actor_role_v1(uid, v_inst.organization_id);
  if (actor_role is null or actor_role not in ('owner','admin'))
     and not public.is_admin() then
    return 'not_found';  -- merged with missing — no oracle
  end if;
  if v_inst.status <> 'pending' then return 'not_pending'; end if;

  update public.workflow_instance_steps
     set status = 'skipped', completed_at = now()
   where instance_id = v_inst.id and status in ('waiting','active','escalated');
  update public.workflow_instances
     set status = 'cancelled', completed_at = now(), current_step_order = null
   where id = v_inst.id;
  insert into public.workflow_transitions
    (instance_id, actor_profile_id, action, from_status, to_status, reason)
  values
    (v_inst.id, uid, 'cancelled', 'pending', 'cancelled', v_reason);

  return 'cancelled';
end;
$$;
revoke all on function public.cancel_workflow_instance_v1(text, text) from public;
revoke all on function public.cancel_workflow_instance_v1(text, text) from anon;
grant execute on function public.cancel_workflow_instance_v1(text, text) to authenticated;

-- 5h. mark_overdue_workflow_steps_v1 — flips past-deadline ACTIVE steps of
-- an org to 'escalated' and reports which instances moved. ESCALATION IS
-- VISIBILITY, NOT AUTHORITY: this function never touches a decision column,
-- never approves, never rejects — approvers can still decide an escalated
-- step. Callable by the org's governance owner/admin or a platform admin;
-- anyone else receives an empty set (no oracle).
create or replace function public.mark_overdue_workflow_steps_v1(
  p_organization_id text
) returns table (instance_id uuid, step_order int)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_org      uuid;
  actor_role text;
  v_row      record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_org := nullif(trim(coalesce(p_organization_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return;
  end;
  if v_org is null then return; end if;

  actor_role := public.membership_actor_role_v1(uid, v_org);
  if (actor_role is null or actor_role not in ('owner','admin'))
     and not public.is_admin() then
    return;
  end if;

  for v_row in
    with escalated as (
      update public.workflow_instance_steps s
         set status = 'escalated'
        from public.workflow_instances i
       where i.id = s.instance_id
         and i.organization_id = v_org
         and i.status = 'pending'
         and s.status = 'active'
         and s.deadline_at is not null
         and s.deadline_at < now()
      returning s.instance_id as r_instance, s.step_order as r_step
    )
    select r_instance, r_step from escalated
  loop
    insert into public.workflow_transitions
      (instance_id, actor_profile_id, action, step_order, from_status, to_status)
    values
      (v_row.r_instance, uid, 'escalated', v_row.r_step, 'active', 'escalated');
    instance_id := v_row.r_instance;
    step_order  := v_row.r_step;
    return next;
  end loop;
  return;
end;
$$;
revoke all on function public.mark_overdue_workflow_steps_v1(text) from public;
revoke all on function public.mark_overdue_workflow_steps_v1(text) from anon;
grant execute on function public.mark_overdue_workflow_steps_v1(text) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260817120000_workflow_engine_v1.down.sql
-- restores the prior state exactly (drops the 3 triggers, 12 new functions
-- and 7 new tables; feature-created rows live only in those tables).
