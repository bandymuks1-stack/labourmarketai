-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after the lead session's
-- verification. Never `db push`.
-- Gate doc: docs/human-gates/employee-lifecycle-gate.md
-- Rollback:  supabase/rollbacks/20260817190000_employee_lifecycle_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- GRANTs + new RLS-bearing tables + an immutability trigger + additive
-- columns on engagement_contexts are RED-class; there is no non-RED way to
-- add a row-level-secured lifecycle engine). Annotation pre-approved by
-- owner mandate 2026-08-17 (autonomous functional completion train V2, §4
-- migration authority). SAFETY CLASS: RED — 7 new tables, 16 new functions
-- (12 commands + 3 visibility helpers + 1 trigger guard), 1 trigger, 4
-- additive NULLABLE columns on engagement_contexts, EXECUTE grants. ZERO
-- existing table shape, policy, grant, trigger or function is modified or
-- recreated (`end_org_membership_v1` is CALLED, never redefined). ZERO DML
-- at apply time. Prod apply stays manual by the LEAD session via Supabase
-- MCP (PENDING APPLY BY LEAD in docs/APPLIED_LEDGER.md).
--
-- 20260817190000 — Employee Lifecycle on engagement_contexts v1.
--
-- PROBLEM (full-reality audit 2026-08-17, EMPLOYEE LIFECYCLE section):
-- onboarding is PARTIAL (project readiness checklists only — no employment
-- onboarding entity), offboarding is MISSING (membership end exists but no
-- checklist / asset-return linkage), probation is DEAD (a descriptive
-- vacancy field), termination is PARTIAL (a status flip with no reason /
-- type / note), and there is no employment-lifecycle history anywhere.
--
-- CANONICAL SUBSTRATE (lead decision, duplication-consolidation plan v1):
-- `engagement_contexts` (EC) IS the canonical employment record — the only
-- model with live production data, keyed to organizations/profiles, wired
-- into journal/evidence/CV. This train OWNS EC schema evolution; the later
-- consolidation agent only redirects writes.
--
-- SOLUTION (smallest honest slice):
--   * 4 additive NULLABLE columns on engagement_contexts: lifecycle_stage
--     (closed vocab), probation_until, ended_reason (closed vocab),
--     ended_note. NO backfill DML: a NULL stage READS as 'active' for an
--     active row and 'ended' for an ended row (the TS read helper and every
--     in-file guard use the same COALESCE rule) — legacy rows need no touch.
--   * engagement_lifecycle_events — append-only, trigger-immutable history
--     of every lifecycle change (action / before / after / actor / note).
--   * onboarding_templates + onboarding_template_items — org-scoped
--     reusable checklists (kinds: task / document_ack / asset_issue /
--     training_note / custom).
--   * onboarding_runs + onboarding_run_items — a template snapshot bound to
--     ONE engagement; per-item status, optional responsible person, and
--     REFERENCE (never duplication) links to real rows: work_tasks /
--     document_acknowledgements / asset_assignments. Completing all
--     required items lets the run complete, flipping stage
--     onboarding→active through the RPC with history.
--   * offboarding_runs + offboarding_run_items — generated checklist
--     (one asset_return item per OPEN asset assignment of the worker in
--     this org — read integration with the assets engine — plus
--     access_removal + final_evidence + bounded custom items). An
--     asset_return item can only be marked done when the linked assignment
--     really reads 'returned'.
--   * end_engagement_lifecycle_v1 — reason/type/note capture AROUND the
--     EXISTING canonical end path: it CALLS public.end_org_membership_v1
--     (never forks it), then stamps ended_reason / ended_note /
--     lifecycle_stage='ended' and writes history. While an offboarding run
--     is open it refuses ('offboarding_open') so the checklist is finished
--     or cancelled first; an engagement with NO run can still end directly
--     — the existing path stays canonical and unblocked.
--   * set_engagement_lifecycle_stage_v1 — probation (stage + date only)
--     and change_pending (stage + note only) per the train scope.
--
-- WHAT IS DELIBERATELY NOT ADDED (binding v1 scope):
--   - NO probation review workflow (stage + probation_until date only);
--   - NO position/salary/contract change machinery ('change_pending' stage
--     + note only — full change management is a later train);
--   - NO new notification types and NO touch of notification_events
--     constraints;
--   - NO scheduler, NO external sending of any kind;
--   - NO change to company_worker_engagements, rosters, invitations,
--     memberships, document-engine internals, workflow-engine internals,
--     work_tasks or timesheet/calendar files (sibling trains own those);
--   - NO recreate of ANY existing RPC/trigger/table/policy — every object
--     below is a NEW name; the 4 EC columns are NEW and NULLABLE.
--
-- RLS DECISION, STATED EXPLICITLY:
--   anon:           NOTHING. No grant, no policy.
--   authenticated:  SELECT only, fail-closed —
--     engagement_lifecycle_events / runs / run items: the engagement's own
--       worker (profile_id = auth.uid()), a manager of the engagement's
--       organization (public.manages_organization — the SANCTIONED dual-arm
--       merge point over both membership truths), or platform admin — ONE
--       definer predicate per family (can_view_engagement_lifecycle_v1,
--       can_view_onboarding_run_v1, can_view_offboarding_run_v1), the
--       assets-recursion-precedent shape;
--     onboarding_templates / items: org managers or platform admin only
--       (workers see run SNAPSHOTS, not authoring templates).
--     Writes: NO insert/update/delete policy on ANY table and an explicit
--       REVOKE — the 12 gated commands are the only write paths.
--   service_role:   untouched default (no engine-specific widening).
--
-- ROLLBACK: supabase/rollbacks/20260817190000_employee_lifecycle_v1.down.sql
-- drops ONLY the 1 trigger, 16 new functions, 7 new tables and the 4 new
-- EC columns. No existing object was touched, so the down file recreates
-- nothing. (Dropping the columns discards lifecycle stamps recorded after
-- apply — stated in the down file; memberships ended through the canonical
-- path STAY ended, a rollback never re-grants authority.)
-- ============================================================================

begin;

-- ── 0. Safety assertions — the truths this engine builds on must exist ──────
do $$
begin
  if to_regclass('public.engagement_contexts') is null then
    raise exception 'engagement_contexts missing — this environment predates the employment spine';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'manages_organization'
  ) then
    raise exception 'manages_organization missing — apply 0013/20260806180000 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'end_org_membership_v1'
  ) then
    raise exception 'end_org_membership_v1 missing — apply 20260802160000 before this migration';
  end if;
  if to_regclass('public.asset_assignments') is null then
    raise exception 'asset_assignments missing — apply 20260718170000 before this migration';
  end if;
end $$;

-- ── 1. Additive lifecycle truth on engagement_contexts ─────────────────────
-- All four columns NULLABLE, no defaults, no backfill: NULL lifecycle_stage
-- READS as 'active' while status='active' and as 'ended' once status='ended'
-- (single COALESCE rule, mirrored by the TS read helper).
alter table public.engagement_contexts
  add column if not exists lifecycle_stage text
    check (lifecycle_stage is null or lifecycle_stage in
      ('onboarding','active','probation','change_pending','offboarding','ended'));
alter table public.engagement_contexts
  add column if not exists probation_until date;
alter table public.engagement_contexts
  add column if not exists ended_reason text
    check (ended_reason is null or ended_reason in
      ('resignation','termination','contract_end','mutual_agreement','retirement','other'));
alter table public.engagement_contexts
  add column if not exists ended_note text
    check (ended_note is null or char_length(ended_note) <= 500);

-- ── 2. Append-only lifecycle history ───────────────────────────────────────
create table if not exists public.engagement_lifecycle_events (
  id                    uuid primary key default gen_random_uuid(),
  engagement_context_id uuid not null references public.engagement_contexts(id) on delete cascade,
  actor_profile_id      uuid references public.profiles(id),
  action                text not null check (action in (
                          'stage_changed','onboarding_started','onboarding_completed',
                          'onboarding_cancelled','offboarding_started','offboarding_completed',
                          'offboarding_cancelled','probation_set','change_noted','engagement_ended')),
  before_stage          text,
  after_stage           text,
  note                  text check (note is null or char_length(note) <= 500),
  metadata              jsonb not null default '{}'::jsonb check (pg_column_size(metadata) <= 2048),
  created_at            timestamptz not null default now()
);
create index if not exists engagement_lifecycle_events_ec_idx
  on public.engagement_lifecycle_events (engagement_context_id, created_at);

comment on table public.engagement_lifecycle_events is
  'APPEND-ONLY employment lifecycle ledger on engagement_contexts. Rows are immutable (trigger-enforced for every role incl. service_role).';

create or replace function public.engagement_lifecycle_events_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'engagement_lifecycle_events is append-only: % is not allowed', tg_op;
end;
$$;
drop trigger if exists engagement_lifecycle_events_append_only on public.engagement_lifecycle_events;
create trigger engagement_lifecycle_events_append_only
  before update or delete on public.engagement_lifecycle_events
  for each row execute function public.engagement_lifecycle_events_guard();

-- ── 3. Onboarding templates (org-scoped authoring) ─────────────────────────
create table if not exists public.onboarding_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 3 and 120),
  description     text check (description is null or char_length(description) <= 1000),
  is_active       boolean not null default true,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists onboarding_templates_org_idx
  on public.onboarding_templates (organization_id);
create unique index if not exists onboarding_templates_org_name_uq
  on public.onboarding_templates (organization_id, lower(name));

create table if not exists public.onboarding_template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.onboarding_templates(id) on delete cascade,
  item_order  int not null check (item_order between 1 and 30),
  kind        text not null check (kind in
                ('task','document_ack','asset_issue','training_note','custom')),
  title       text not null check (char_length(trim(title)) between 2 and 160),
  description text check (description is null or char_length(description) <= 500),
  required    boolean not null default true,
  constraint onboarding_template_items_uq unique (template_id, item_order)
);
create index if not exists onboarding_template_items_template_idx
  on public.onboarding_template_items (template_id);

-- ── 4. Onboarding runs (template snapshot bound to ONE engagement) ─────────
create table if not exists public.onboarding_runs (
  id                    uuid primary key default gen_random_uuid(),
  engagement_context_id uuid not null references public.engagement_contexts(id) on delete cascade,
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  template_id           uuid references public.onboarding_templates(id) on delete set null,
  template_name         text not null check (char_length(template_name) <= 120),
  status                text not null default 'in_progress'
                          check (status in ('in_progress','completed','cancelled')),
  started_by            uuid not null references public.profiles(id),
  started_at            timestamptz not null default now(),
  completed_at          timestamptz,
  constraint onboarding_runs_completed_shape check (
    (status = 'in_progress' and completed_at is null)
    or (status in ('completed','cancelled') and completed_at is not null)
  )
);
create index if not exists onboarding_runs_org_idx
  on public.onboarding_runs (organization_id, status);
-- At most ONE open onboarding run per engagement.
create unique index if not exists onboarding_runs_open_uq
  on public.onboarding_runs (engagement_context_id)
  where status = 'in_progress';

create table if not exists public.onboarding_run_items (
  id                     uuid primary key default gen_random_uuid(),
  run_id                 uuid not null references public.onboarding_runs(id) on delete cascade,
  item_order             int not null check (item_order between 1 and 30),
  kind                   text not null check (kind in
                           ('task','document_ack','asset_issue','training_note','custom')),
  title                  text not null check (char_length(trim(title)) between 2 and 160),
  description            text check (description is null or char_length(description) <= 500),
  required               boolean not null default true,
  status                 text not null default 'pending'
                           check (status in ('pending','done','skipped')),
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  linked_entity_type     text check (linked_entity_type is null or linked_entity_type in
                           ('work_task','document_acknowledgement','asset_assignment')),
  linked_entity_id       uuid,
  note                   text check (note is null or char_length(note) <= 500),
  completed_by           uuid references public.profiles(id),
  completed_at           timestamptz,
  constraint onboarding_run_items_uq unique (run_id, item_order),
  constraint onboarding_run_items_link_pair check (
    (linked_entity_type is null) = (linked_entity_id is null)
  ),
  constraint onboarding_run_items_done_shape check (
    (status = 'pending' and completed_by is null and completed_at is null)
    or (status in ('done','skipped') and completed_by is not null and completed_at is not null)
  )
);
create index if not exists onboarding_run_items_run_idx
  on public.onboarding_run_items (run_id, item_order);

-- ── 5. Offboarding runs (generated checklist, asset read-integration) ──────
create table if not exists public.offboarding_runs (
  id                    uuid primary key default gen_random_uuid(),
  engagement_context_id uuid not null references public.engagement_contexts(id) on delete cascade,
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  status                text not null default 'in_progress'
                          check (status in ('in_progress','completed','cancelled')),
  started_by            uuid not null references public.profiles(id),
  started_at            timestamptz not null default now(),
  completed_at          timestamptz,
  constraint offboarding_runs_completed_shape check (
    (status = 'in_progress' and completed_at is null)
    or (status in ('completed','cancelled') and completed_at is not null)
  )
);
create index if not exists offboarding_runs_org_idx
  on public.offboarding_runs (organization_id, status);
create unique index if not exists offboarding_runs_open_uq
  on public.offboarding_runs (engagement_context_id)
  where status = 'in_progress';

create table if not exists public.offboarding_run_items (
  id                     uuid primary key default gen_random_uuid(),
  run_id                 uuid not null references public.offboarding_runs(id) on delete cascade,
  item_order             int not null check (item_order between 1 and 60),
  kind                   text not null check (kind in
                           ('asset_return','document_ack','access_removal','final_evidence','custom')),
  title                  text not null check (char_length(trim(title)) between 2 and 160),
  description            text check (description is null or char_length(description) <= 500),
  required               boolean not null default true,
  status                 text not null default 'pending'
                           check (status in ('pending','done','skipped')),
  linked_entity_type     text check (linked_entity_type is null or linked_entity_type in
                           ('document_acknowledgement','asset_assignment')),
  linked_entity_id       uuid,
  note                   text check (note is null or char_length(note) <= 500),
  completed_by           uuid references public.profiles(id),
  completed_at           timestamptz,
  constraint offboarding_run_items_uq unique (run_id, item_order),
  constraint offboarding_run_items_link_pair check (
    (linked_entity_type is null) = (linked_entity_id is null)
  ),
  constraint offboarding_run_items_done_shape check (
    (status = 'pending' and completed_by is null and completed_at is null)
    or (status in ('done','skipped') and completed_by is not null and completed_at is not null)
  )
);
create index if not exists offboarding_run_items_run_idx
  on public.offboarding_run_items (run_id, item_order);

-- ── 6. Visibility helpers (SECURITY DEFINER, recursion-free policies) ──────

-- 6a. THE lifecycle visibility predicate: the engagement's own worker, a
-- manager of its organization (sanctioned dual-arm manages_organization),
-- or platform admin.
create or replace function public.can_view_engagement_lifecycle_v1(p_engagement_context_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.engagement_contexts ec
     where ec.id = p_engagement_context_id
       and (
         ec.profile_id = auth.uid()
         or public.is_admin()
         or (ec.organization_id is not null
             and public.manages_organization(ec.organization_id))
       )
  )
$$;
revoke all on function public.can_view_engagement_lifecycle_v1(uuid) from public;
revoke all on function public.can_view_engagement_lifecycle_v1(uuid) from anon;
grant execute on function public.can_view_engagement_lifecycle_v1(uuid) to authenticated;

-- 6b/6c. Run families delegate to the same predicate one hop up.
create or replace function public.can_view_onboarding_run_v1(p_run_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.onboarding_runs r
     where r.id = p_run_id
       and public.can_view_engagement_lifecycle_v1(r.engagement_context_id)
  )
$$;
revoke all on function public.can_view_onboarding_run_v1(uuid) from public;
revoke all on function public.can_view_onboarding_run_v1(uuid) from anon;
grant execute on function public.can_view_onboarding_run_v1(uuid) to authenticated;

create or replace function public.can_view_offboarding_run_v1(p_run_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.offboarding_runs r
     where r.id = p_run_id
       and public.can_view_engagement_lifecycle_v1(r.engagement_context_id)
  )
$$;
revoke all on function public.can_view_offboarding_run_v1(uuid) from public;
revoke all on function public.can_view_offboarding_run_v1(uuid) from anon;
grant execute on function public.can_view_offboarding_run_v1(uuid) to authenticated;

-- ── 7. RLS — SELECT-only, fail-closed; writes stay RPC-only ────────────────
alter table public.engagement_lifecycle_events enable row level security;
alter table public.onboarding_templates enable row level security;
alter table public.onboarding_template_items enable row level security;
alter table public.onboarding_runs enable row level security;
alter table public.onboarding_run_items enable row level security;
alter table public.offboarding_runs enable row level security;
alter table public.offboarding_run_items enable row level security;

revoke all on public.engagement_lifecycle_events,
              public.onboarding_templates,
              public.onboarding_template_items,
              public.onboarding_runs,
              public.onboarding_run_items,
              public.offboarding_runs,
              public.offboarding_run_items
  from public;
revoke all on public.engagement_lifecycle_events,
              public.onboarding_templates,
              public.onboarding_template_items,
              public.onboarding_runs,
              public.onboarding_run_items,
              public.offboarding_runs,
              public.offboarding_run_items
  from anon;
revoke all on public.engagement_lifecycle_events,
              public.onboarding_templates,
              public.onboarding_template_items,
              public.onboarding_runs,
              public.onboarding_run_items,
              public.offboarding_runs,
              public.offboarding_run_items
  from authenticated;
grant select on public.engagement_lifecycle_events,
                public.onboarding_templates,
                public.onboarding_template_items,
                public.onboarding_runs,
                public.onboarding_run_items,
                public.offboarding_runs,
                public.offboarding_run_items
  to authenticated;

drop policy if exists engagement_lifecycle_events_select on public.engagement_lifecycle_events;
create policy engagement_lifecycle_events_select on public.engagement_lifecycle_events
  for select to authenticated
  using (public.can_view_engagement_lifecycle_v1(engagement_context_id));

drop policy if exists onboarding_templates_select on public.onboarding_templates;
create policy onboarding_templates_select on public.onboarding_templates
  for select to authenticated
  using (public.manages_organization(organization_id) or public.is_admin());

drop policy if exists onboarding_template_items_select on public.onboarding_template_items;
create policy onboarding_template_items_select on public.onboarding_template_items
  for select to authenticated
  using (
    exists (
      select 1 from public.onboarding_templates t
       where t.id = onboarding_template_items.template_id
         and (public.manages_organization(t.organization_id) or public.is_admin())
    )
  );

drop policy if exists onboarding_runs_select on public.onboarding_runs;
create policy onboarding_runs_select on public.onboarding_runs
  for select to authenticated
  using (public.can_view_onboarding_run_v1(id));

drop policy if exists onboarding_run_items_select on public.onboarding_run_items;
create policy onboarding_run_items_select on public.onboarding_run_items
  for select to authenticated
  using (public.can_view_onboarding_run_v1(run_id));

drop policy if exists offboarding_runs_select on public.offboarding_runs;
create policy offboarding_runs_select on public.offboarding_runs
  for select to authenticated
  using (public.can_view_offboarding_run_v1(id));

drop policy if exists offboarding_run_items_select on public.offboarding_run_items;
create policy offboarding_run_items_select on public.offboarding_run_items
  for select to authenticated
  using (public.can_view_offboarding_run_v1(run_id));

-- No insert/update/delete policy anywhere: with the explicit REVOKE above,
-- the commands below are the ONLY write paths.

-- ── 8. Commands (SECURITY DEFINER, outcome-string contract) ────────────────

-- 8a. create_onboarding_template_v1 — an org manager authors a checklist.
-- p_items: jsonb array, 1..30 items:
--   { "kind": closed vocab, "title": text, "description": text?,
--     "required": bool? (default true) }
create or replace function public.create_onboarding_template_v1(
  p_organization_id text,
  p_name            text,
  p_description     text,
  p_items           jsonb
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_org  uuid;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_desc text := nullif(trim(coalesce(p_description, '')), '');
  v_tpl  uuid;
  v_item jsonb;
  v_i    int := 0;
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
  if not (public.manages_organization(v_org) or public.is_admin()) then
    return 'not_authorized';
  end if;

  if v_name is null or char_length(v_name) < 3 or char_length(v_name) > 120 then
    return 'invalid';
  end if;
  if v_desc is not null and char_length(v_desc) > 1000 then return 'invalid'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    return 'invalid';
  end if;

  -- Validate every item BEFORE any write.
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' then return 'invalid'; end if;
    if coalesce(v_item->>'kind', '') not in
       ('task','document_ack','asset_issue','training_note','custom') then
      return 'invalid';
    end if;
    if nullif(trim(coalesce(v_item->>'title', '')), '') is null
       or char_length(trim(v_item->>'title')) < 2
       or char_length(v_item->>'title') > 160 then
      return 'invalid';
    end if;
    if v_item ? 'description' and jsonb_typeof(v_item->'description') = 'string'
       and char_length(v_item->>'description') > 500 then
      return 'invalid';
    end if;
    if v_item ? 'required' and jsonb_typeof(v_item->'required') not in ('boolean','null') then
      return 'invalid';
    end if;
  end loop;

  -- Abuse cap: a template catalogue is a short list, not a data dump.
  if (select count(*) from public.onboarding_templates t
       where t.organization_id = v_org) >= 30 then
    return 'limit_reached';
  end if;
  if exists (select 1 from public.onboarding_templates t
              where t.organization_id = v_org and lower(t.name) = lower(v_name)) then
    return 'already_exists';
  end if;

  insert into public.onboarding_templates (organization_id, name, description, created_by)
  values (v_org, v_name, v_desc, uid)
  returning id into v_tpl;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_i := v_i + 1;
    insert into public.onboarding_template_items
      (template_id, item_order, kind, title, description, required)
    values
      (v_tpl, v_i, v_item->>'kind', trim(v_item->>'title'),
       nullif(trim(coalesce(v_item->>'description', '')), ''),
       coalesce((v_item->>'required')::boolean, true));
  end loop;

  return 'created';
end;
$$;
revoke all on function public.create_onboarding_template_v1(text, text, text, jsonb) from public;
revoke all on function public.create_onboarding_template_v1(text, text, text, jsonb) from anon;
grant execute on function public.create_onboarding_template_v1(text, text, text, jsonb) to authenticated;

-- 8b. start_onboarding_run_v1 — snapshot a template onto ONE engagement.
-- Returns the run id (uuid-as-text) on success; a short outcome otherwise
-- (the TS layer distinguishes by UUID shape — the approval engine's
-- start-instance precedent).
create or replace function public.start_onboarding_run_v1(
  p_engagement_context_id text,
  p_template_id           text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_ec_id uuid;
  v_tpl_id uuid;
  v_ec    record;
  v_tpl   record;
  v_stage text;
  v_run   uuid;
  v_item  record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_ec_id  := nullif(trim(coalesce(p_engagement_context_id, '')), '')::uuid;
    v_tpl_id := nullif(trim(coalesce(p_template_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_ec_id is null or v_tpl_id is null then return 'invalid'; end if;

  -- Serialize concurrent lifecycle commands on the same engagement.
  select ec.id, ec.organization_id, ec.status, ec.lifecycle_stage
    into v_ec
    from public.engagement_contexts ec
   where ec.id = v_ec_id
   for update;
  -- Merged: missing row and no authority answer the same — no oracle.
  if v_ec.id is null then return 'not_found'; end if;
  if v_ec.organization_id is null then
    if public.is_admin() then return 'not_org_scoped'; end if;
    return 'not_found';
  end if;
  if not (public.manages_organization(v_ec.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_ec.status <> 'active' then return 'not_active'; end if;

  v_stage := coalesce(v_ec.lifecycle_stage, 'active');
  if v_stage not in ('active','onboarding') then return 'invalid_stage'; end if;

  select t.id, t.name, t.organization_id, t.is_active
    into v_tpl
    from public.onboarding_templates t
   where t.id = v_tpl_id and t.organization_id = v_ec.organization_id;
  if v_tpl.id is null or not v_tpl.is_active then return 'template_not_found'; end if;

  if exists (select 1 from public.onboarding_runs r
              where r.engagement_context_id = v_ec.id and r.status = 'in_progress') then
    return 'already_running';
  end if;

  begin
    insert into public.onboarding_runs
      (engagement_context_id, organization_id, template_id, template_name, started_by)
    values (v_ec.id, v_ec.organization_id, v_tpl.id, left(v_tpl.name, 120), uid)
    returning id into v_run;
  exception when unique_violation then
    return 'already_running';
  end;

  for v_item in
    select i.item_order, i.kind, i.title, i.description, i.required
      from public.onboarding_template_items i
     where i.template_id = v_tpl.id
     order by i.item_order
  loop
    insert into public.onboarding_run_items
      (run_id, item_order, kind, title, description, required)
    values (v_run, v_item.item_order, v_item.kind, v_item.title,
            v_item.description, v_item.required);
  end loop;

  if v_stage <> 'onboarding' then
    update public.engagement_contexts
       set lifecycle_stage = 'onboarding', updated_at = now()
     where id = v_ec.id;
    insert into public.engagement_lifecycle_events
      (engagement_context_id, actor_profile_id, action, before_stage, after_stage, metadata)
    values (v_ec.id, uid, 'stage_changed', v_stage, 'onboarding',
            jsonb_build_object('run_id', v_run::text));
  end if;
  insert into public.engagement_lifecycle_events
    (engagement_context_id, actor_profile_id, action, before_stage, after_stage, metadata)
  values (v_ec.id, uid, 'onboarding_started', v_stage, 'onboarding',
          jsonb_build_object('run_id', v_run::text, 'template', left(v_tpl.name, 120)));

  return v_run::text;
end;
$$;
revoke all on function public.start_onboarding_run_v1(text, text) from public;
revoke all on function public.start_onboarding_run_v1(text, text) from anon;
grant execute on function public.start_onboarding_run_v1(text, text) to authenticated;

-- 8c. assign_onboarding_item_v1 — a manager names the responsible person
-- (must belong to the org via EITHER membership truth, or be the run's own
-- worker). NULL clears the assignment.
create or replace function public.assign_onboarding_item_v1(
  p_item_id                text,
  p_responsible_profile_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_item_id uuid;
  v_resp   uuid;
  v_row    record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_item_id := nullif(trim(coalesce(p_item_id, '')), '')::uuid;
    v_resp    := nullif(trim(coalesce(p_responsible_profile_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_item_id is null then return 'invalid'; end if;

  select i.id, i.status, r.status as run_status, r.organization_id,
         ec.profile_id as worker_profile_id
    into v_row
    from public.onboarding_run_items i
    join public.onboarding_runs r on r.id = i.run_id
    join public.engagement_contexts ec on ec.id = r.engagement_context_id
   where i.id = v_item_id;
  if v_row.id is null
     or not (public.manages_organization(v_row.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.run_status <> 'in_progress' then return 'run_closed'; end if;
  if v_row.status <> 'pending' then return 'item_closed'; end if;

  if v_resp is not null
     and v_resp <> v_row.worker_profile_id
     and not exists (
       select 1 from public.company_memberships m
        where m.profile_id = v_resp
          and m.organization_id = v_row.organization_id
          and m.status = 'active'
     )
     and not exists (
       select 1 from public.engagement_contexts ec2
        where ec2.profile_id = v_resp
          and ec2.organization_id = v_row.organization_id
          and ec2.status = 'active'
     ) then
    return 'invalid_responsible';
  end if;

  update public.onboarding_run_items
     set responsible_profile_id = v_resp
   where id = v_item_id;
  return 'updated';
end;
$$;
revoke all on function public.assign_onboarding_item_v1(text, text) from public;
revoke all on function public.assign_onboarding_item_v1(text, text) from anon;
grant execute on function public.assign_onboarding_item_v1(text, text) to authenticated;

-- 8d. set_onboarding_item_status_v1 — reference-and-confirm item progress.
-- Managers may set any status; the run's own worker may mark DONE the items
-- that are honestly theirs: document_ack / training_note / custom kinds, or
-- any item assigned to them. Linked references are VERIFIED, never trusted:
--   work_task              → the task exists, belongs to the run's worker
--                            (assignee) and reads 'done';
--   document_acknowledgement → the ack row names the worker and is
--                            acknowledged (document engine RPCs did that);
--   asset_assignment       → the assignment names the worker and is open
--                            (issued/acknowledged) — the asset really is
--                            in the worker's hands.
create or replace function public.set_onboarding_item_status_v1(
  p_item_id            text,
  p_status             text,
  p_note               text default null,
  p_linked_entity_type text default null,
  p_linked_entity_id   text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_item_id uuid;
  v_link_id uuid;
  v_status  text := nullif(trim(coalesce(p_status, '')), '');
  v_note    text := nullif(left(coalesce(p_note, ''), 500), '');
  v_ltype   text := nullif(trim(coalesce(p_linked_entity_type, '')), '');
  v_row     record;
  v_is_mgr  boolean;
  v_wrk_id  uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_item_id := nullif(trim(coalesce(p_item_id, '')), '')::uuid;
    v_link_id := nullif(trim(coalesce(p_linked_entity_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_item_id is null then return 'invalid'; end if;
  if v_status is null or v_status not in ('pending','done','skipped') then
    return 'invalid';
  end if;
  if (v_ltype is null) <> (v_link_id is null) then return 'invalid'; end if;

  select i.id, i.kind, i.status, i.required, i.responsible_profile_id,
         r.status as run_status, r.organization_id,
         ec.profile_id as worker_profile_id
    into v_row
    from public.onboarding_run_items i
    join public.onboarding_runs r on r.id = i.run_id
    join public.engagement_contexts ec on ec.id = r.engagement_context_id
   where i.id = v_item_id;
  if v_row.id is null then return 'not_found'; end if;

  v_is_mgr := public.manages_organization(v_row.organization_id) or public.is_admin();
  if not v_is_mgr then
    -- The worker's own honest confirmations only; merged with missing rows.
    if v_row.worker_profile_id <> uid then return 'not_found'; end if;
    if v_status <> 'done' then return 'not_authorized'; end if;
    if v_row.kind not in ('document_ack','training_note','custom')
       and coalesce(v_row.responsible_profile_id, '00000000-0000-0000-0000-000000000000'::uuid) <> uid then
      return 'not_authorized';
    end if;
  end if;
  if v_row.run_status <> 'in_progress' then return 'run_closed'; end if;
  if v_row.status = v_status then return 'updated'; end if;

  -- Reference validation (deep integration where cheap, honest refusal
  -- otherwise). Only meaningful when marking DONE with a link.
  if v_status = 'done' and v_ltype is not null then
    if v_ltype = 'work_task' then
      if v_row.kind <> 'task' then return 'link_invalid'; end if;
      if not exists (
        select 1 from public.work_tasks wt
         where wt.id = v_link_id
           and wt.assignee_profile_id = v_row.worker_profile_id
           and wt.status = 'done'
      ) then return 'link_invalid'; end if;
    elsif v_ltype = 'document_acknowledgement' then
      if v_row.kind <> 'document_ack' then return 'link_invalid'; end if;
      if not exists (
        select 1 from public.document_acknowledgements a
         where a.id = v_link_id
           and a.assignee_profile_id = v_row.worker_profile_id
           and a.acknowledged_at is not null
      ) then return 'link_invalid'; end if;
    elsif v_ltype = 'asset_assignment' then
      if v_row.kind <> 'asset_issue' then return 'link_invalid'; end if;
      select w.id into v_wrk_id from public.workers w
       where w.profile_id = v_row.worker_profile_id limit 1;
      if v_wrk_id is null or not exists (
        select 1 from public.asset_assignments aa
         where aa.id = v_link_id
           and aa.worker_id = v_wrk_id
           and aa.status in ('issued','acknowledged')
      ) then return 'link_invalid'; end if;
    else
      return 'link_invalid';
    end if;
  end if;

  update public.onboarding_run_items
     set status = v_status,
         note = coalesce(v_note, note),
         linked_entity_type = case when v_status = 'done' and v_ltype is not null
                                   then v_ltype else linked_entity_type end,
         linked_entity_id   = case when v_status = 'done' and v_link_id is not null
                                   then v_link_id else linked_entity_id end,
         completed_by = case when v_status in ('done','skipped') then uid else null end,
         completed_at = case when v_status in ('done','skipped') then now() else null end
   where id = v_item_id;
  return 'updated';
end;
$$;
revoke all on function public.set_onboarding_item_status_v1(text, text, text, text, text) from public;
revoke all on function public.set_onboarding_item_status_v1(text, text, text, text, text) from anon;
grant execute on function public.set_onboarding_item_status_v1(text, text, text, text, text) to authenticated;

-- 8e. complete_onboarding_run_v1 — all REQUIRED items must read 'done';
-- flips lifecycle onboarding→active with history.
create or replace function public.complete_onboarding_run_v1(
  p_run_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_run_id uuid;
  v_run    record;
  v_stage  text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_run_id := nullif(trim(coalesce(p_run_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_run_id is null then return 'invalid'; end if;

  select r.id, r.status, r.organization_id, r.engagement_context_id
    into v_run
    from public.onboarding_runs r
   where r.id = v_run_id
   for update;
  if v_run.id is null
     or not (public.manages_organization(v_run.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_run.status <> 'in_progress' then return 'run_closed'; end if;

  if exists (
    select 1 from public.onboarding_run_items i
     where i.run_id = v_run.id and i.required and i.status <> 'done'
  ) then
    return 'items_open';
  end if;

  update public.onboarding_runs
     set status = 'completed', completed_at = now()
   where id = v_run.id;

  select coalesce(ec.lifecycle_stage, 'active') into v_stage
    from public.engagement_contexts ec where ec.id = v_run.engagement_context_id;
  if v_stage = 'onboarding' then
    update public.engagement_contexts
       set lifecycle_stage = 'active', updated_at = now()
     where id = v_run.engagement_context_id;
    insert into public.engagement_lifecycle_events
      (engagement_context_id, actor_profile_id, action, before_stage, after_stage, metadata)
    values (v_run.engagement_context_id, uid, 'stage_changed', 'onboarding', 'active',
            jsonb_build_object('run_id', v_run.id::text));
  end if;
  insert into public.engagement_lifecycle_events
    (engagement_context_id, actor_profile_id, action, before_stage, after_stage, metadata)
  values (v_run.engagement_context_id, uid, 'onboarding_completed', v_stage,
          case when v_stage = 'onboarding' then 'active' else v_stage end,
          jsonb_build_object('run_id', v_run.id::text));

  return 'completed';
end;
$$;
revoke all on function public.complete_onboarding_run_v1(text) from public;
revoke all on function public.complete_onboarding_run_v1(text) from anon;
grant execute on function public.complete_onboarding_run_v1(text) to authenticated;

-- 8f. cancel_onboarding_run_v1 — a manager abandons the checklist; the
-- engagement honestly returns to 'active' (the person IS employed).
create or replace function public.cancel_onboarding_run_v1(
  p_run_id text,
  p_reason text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_run_id uuid;
  v_reason text := nullif(left(coalesce(p_reason, ''), 500), '');
  v_run    record;
  v_stage  text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_run_id := nullif(trim(coalesce(p_run_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_run_id is null then return 'invalid'; end if;

  select r.id, r.status, r.organization_id, r.engagement_context_id
    into v_run
    from public.onboarding_runs r
   where r.id = v_run_id
   for update;
  if v_run.id is null
     or not (public.manages_organization(v_run.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_run.status <> 'in_progress' then return 'run_closed'; end if;

  update public.onboarding_runs
     set status = 'cancelled', completed_at = now()
   where id = v_run.id;

  select coalesce(ec.lifecycle_stage, 'active') into v_stage
    from public.engagement_contexts ec where ec.id = v_run.engagement_context_id;
  if v_stage = 'onboarding' then
    update public.engagement_contexts
       set lifecycle_stage = 'active', updated_at = now()
     where id = v_run.engagement_context_id;
    insert into public.engagement_lifecycle_events
      (engagement_context_id, actor_profile_id, action, before_stage, after_stage, note, metadata)
    values (v_run.engagement_context_id, uid, 'stage_changed', 'onboarding', 'active',
            v_reason, jsonb_build_object('run_id', v_run.id::text));
  end if;
  insert into public.engagement_lifecycle_events
    (engagement_context_id, actor_profile_id, action, before_stage, after_stage, note, metadata)
  values (v_run.engagement_context_id, uid, 'onboarding_cancelled', v_stage,
          case when v_stage = 'onboarding' then 'active' else v_stage end,
          v_reason, jsonb_build_object('run_id', v_run.id::text));

  return 'cancelled';
end;
$$;
revoke all on function public.cancel_onboarding_run_v1(text, text) from public;
revoke all on function public.cancel_onboarding_run_v1(text, text) from anon;
grant execute on function public.cancel_onboarding_run_v1(text, text) to authenticated;

-- 8g. start_offboarding_run_v1 — generates the checklist from REALITY:
-- one asset_return item per OPEN assignment of the worker on this org's
-- assets (read integration — reference, not duplication), an access-removal
-- confirm item, a final-evidence confirm item, plus bounded custom items.
-- p_extra_items: optional jsonb array (0..20) of
--   { "kind": 'document_ack'|'custom', "title": text, "description"?: text,
--     "required"?: bool }.
create or replace function public.start_offboarding_run_v1(
  p_engagement_context_id text,
  p_extra_items           jsonb default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_ec_id uuid;
  v_ec    record;
  v_stage text;
  v_run   uuid;
  v_wrk   uuid;
  v_n     int := 0;
  v_item  jsonb;
  v_asset record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_ec_id := nullif(trim(coalesce(p_engagement_context_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_ec_id is null then return 'invalid'; end if;

  if p_extra_items is not null then
    if jsonb_typeof(p_extra_items) <> 'array' or jsonb_array_length(p_extra_items) > 20 then
      return 'invalid';
    end if;
    for v_item in select * from jsonb_array_elements(p_extra_items) loop
      if jsonb_typeof(v_item) <> 'object' then return 'invalid'; end if;
      if coalesce(v_item->>'kind', '') not in ('document_ack','custom') then
        return 'invalid';
      end if;
      if nullif(trim(coalesce(v_item->>'title', '')), '') is null
         or char_length(trim(v_item->>'title')) < 2
         or char_length(v_item->>'title') > 160 then
        return 'invalid';
      end if;
      if v_item ? 'description' and jsonb_typeof(v_item->'description') = 'string'
         and char_length(v_item->>'description') > 500 then
        return 'invalid';
      end if;
    end loop;
  end if;

  select ec.id, ec.organization_id, ec.status, ec.lifecycle_stage, ec.profile_id
    into v_ec
    from public.engagement_contexts ec
   where ec.id = v_ec_id
   for update;
  if v_ec.id is null then return 'not_found'; end if;
  if v_ec.organization_id is null then
    if public.is_admin() then return 'not_org_scoped'; end if;
    return 'not_found';
  end if;
  if not (public.manages_organization(v_ec.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_ec.status <> 'active' then return 'not_active'; end if;

  v_stage := coalesce(v_ec.lifecycle_stage, 'active');
  if v_stage = 'onboarding'
     or exists (select 1 from public.onboarding_runs r
                 where r.engagement_context_id = v_ec.id and r.status = 'in_progress') then
    return 'onboarding_open';
  end if;
  if v_stage not in ('active','probation','change_pending','offboarding') then
    return 'invalid_stage';
  end if;
  if exists (select 1 from public.offboarding_runs r
              where r.engagement_context_id = v_ec.id and r.status = 'in_progress') then
    return 'already_running';
  end if;

  begin
    insert into public.offboarding_runs
      (engagement_context_id, organization_id, started_by)
    values (v_ec.id, v_ec.organization_id, uid)
    returning id into v_run;
  exception when unique_violation then
    return 'already_running';
  end;

  -- Asset reality: every OPEN assignment of this worker on this org's assets
  -- becomes a required return item, linked by REFERENCE to the assignment.
  select w.id into v_wrk from public.workers w
   where w.profile_id = v_ec.profile_id limit 1;
  if v_wrk is not null then
    for v_asset in
      select aa.id as assignment_id, a.name as asset_name
        from public.asset_assignments aa
        join public.assets a on a.id = aa.asset_id
       where aa.worker_id = v_wrk
         and a.organization_id = v_ec.organization_id
         and aa.status in ('issued','acknowledged')
       order by aa.issued_at
       limit 40
    loop
      v_n := v_n + 1;
      insert into public.offboarding_run_items
        (run_id, item_order, kind, title, required, linked_entity_type, linked_entity_id)
      values (v_run, v_n, 'asset_return',
              case when char_length(trim(coalesce(v_asset.asset_name, ''))) >= 2
                   then left(v_asset.asset_name, 160) else 'asset_return' end,
              true, 'asset_assignment', v_asset.assignment_id);
    end loop;
  end if;

  v_n := v_n + 1;
  insert into public.offboarding_run_items (run_id, item_order, kind, title, required)
  values (v_run, v_n, 'access_removal', 'access_removal', true);
  v_n := v_n + 1;
  insert into public.offboarding_run_items (run_id, item_order, kind, title, required)
  values (v_run, v_n, 'final_evidence', 'final_evidence', true);

  if p_extra_items is not null then
    for v_item in select * from jsonb_array_elements(p_extra_items) loop
      v_n := v_n + 1;
      insert into public.offboarding_run_items
        (run_id, item_order, kind, title, description, required)
      values (v_run, v_n, v_item->>'kind', trim(v_item->>'title'),
              nullif(trim(coalesce(v_item->>'description', '')), ''),
              coalesce((v_item->>'required')::boolean, true));
    end loop;
  end if;

  if v_stage <> 'offboarding' then
    update public.engagement_contexts
       set lifecycle_stage = 'offboarding', updated_at = now()
     where id = v_ec.id;
    insert into public.engagement_lifecycle_events
      (engagement_context_id, actor_profile_id, action, before_stage, after_stage, metadata)
    values (v_ec.id, uid, 'stage_changed', v_stage, 'offboarding',
            jsonb_build_object('run_id', v_run::text));
  end if;
  insert into public.engagement_lifecycle_events
    (engagement_context_id, actor_profile_id, action, before_stage, after_stage, metadata)
  values (v_ec.id, uid, 'offboarding_started', v_stage, 'offboarding',
          jsonb_build_object('run_id', v_run::text, 'asset_items', greatest(v_n - 2, 0)));

  return v_run::text;
end;
$$;
revoke all on function public.start_offboarding_run_v1(text, jsonb) from public;
revoke all on function public.start_offboarding_run_v1(text, jsonb) from anon;
grant execute on function public.start_offboarding_run_v1(text, jsonb) to authenticated;

-- 8h. set_offboarding_item_status_v1 — manager-side confirmations.
-- An asset_return item can only read 'done' when the LINKED assignment
-- really reads 'returned' in the assets engine (reference + confirm; the
-- return itself happens through return_asset_v1, never here). A linked
-- document_ack item requires the acknowledged row.
create or replace function public.set_offboarding_item_status_v1(
  p_item_id text,
  p_status  text,
  p_note    text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_item_id uuid;
  v_status  text := nullif(trim(coalesce(p_status, '')), '');
  v_note    text := nullif(left(coalesce(p_note, ''), 500), '');
  v_row     record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_item_id := nullif(trim(coalesce(p_item_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_item_id is null then return 'invalid'; end if;
  if v_status is null or v_status not in ('pending','done','skipped') then
    return 'invalid';
  end if;

  select i.id, i.kind, i.status, i.linked_entity_type, i.linked_entity_id,
         r.status as run_status, r.organization_id,
         ec.profile_id as worker_profile_id
    into v_row
    from public.offboarding_run_items i
    join public.offboarding_runs r on r.id = i.run_id
    join public.engagement_contexts ec on ec.id = r.engagement_context_id
   where i.id = v_item_id;
  if v_row.id is null
     or not (public.manages_organization(v_row.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.run_status <> 'in_progress' then return 'run_closed'; end if;
  if v_row.status = v_status then return 'updated'; end if;

  if v_status = 'done' then
    if v_row.kind = 'asset_return'
       and v_row.linked_entity_type = 'asset_assignment' then
      if not exists (
        select 1 from public.asset_assignments aa
         where aa.id = v_row.linked_entity_id
           and aa.status = 'returned'
      ) then
        return 'asset_not_returned';
      end if;
    elsif v_row.kind = 'document_ack'
       and v_row.linked_entity_type = 'document_acknowledgement' then
      if not exists (
        select 1 from public.document_acknowledgements a
         where a.id = v_row.linked_entity_id
           and a.assignee_profile_id = v_row.worker_profile_id
           and a.acknowledged_at is not null
      ) then
        return 'link_invalid';
      end if;
    end if;
  end if;
  -- A required asset_return item may not be waved through as 'skipped'
  -- while its linked assignment is still open — transfer or return the
  -- asset through the assets engine first.
  if v_status = 'skipped'
     and v_row.kind = 'asset_return'
     and v_row.linked_entity_type = 'asset_assignment'
     and exists (
       select 1 from public.asset_assignments aa
        where aa.id = v_row.linked_entity_id
          and aa.status in ('issued','acknowledged')
     ) then
    return 'asset_not_returned';
  end if;

  update public.offboarding_run_items
     set status = v_status,
         note = coalesce(v_note, note),
         completed_by = case when v_status in ('done','skipped') then uid else null end,
         completed_at = case when v_status in ('done','skipped') then now() else null end
   where id = v_item_id;
  return 'updated';
end;
$$;
revoke all on function public.set_offboarding_item_status_v1(text, text, text) from public;
revoke all on function public.set_offboarding_item_status_v1(text, text, text) from anon;
grant execute on function public.set_offboarding_item_status_v1(text, text, text) to authenticated;

-- 8i. complete_offboarding_run_v1 — all REQUIRED items done. Completing the
-- checklist does NOT end the engagement; it unlocks
-- end_engagement_lifecycle_v1 (which refuses while a run is open).
create or replace function public.complete_offboarding_run_v1(
  p_run_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_run_id uuid;
  v_run    record;
  v_stage  text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_run_id := nullif(trim(coalesce(p_run_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_run_id is null then return 'invalid'; end if;

  select r.id, r.status, r.organization_id, r.engagement_context_id
    into v_run
    from public.offboarding_runs r
   where r.id = v_run_id
   for update;
  if v_run.id is null
     or not (public.manages_organization(v_run.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_run.status <> 'in_progress' then return 'run_closed'; end if;

  if exists (
    select 1 from public.offboarding_run_items i
     where i.run_id = v_run.id and i.required and i.status <> 'done'
  ) then
    return 'items_open';
  end if;

  update public.offboarding_runs
     set status = 'completed', completed_at = now()
   where id = v_run.id;

  select coalesce(ec.lifecycle_stage, 'active') into v_stage
    from public.engagement_contexts ec where ec.id = v_run.engagement_context_id;
  insert into public.engagement_lifecycle_events
    (engagement_context_id, actor_profile_id, action, before_stage, after_stage, metadata)
  values (v_run.engagement_context_id, uid, 'offboarding_completed', v_stage, v_stage,
          jsonb_build_object('run_id', v_run.id::text));

  return 'completed';
end;
$$;
revoke all on function public.complete_offboarding_run_v1(text) from public;
revoke all on function public.complete_offboarding_run_v1(text) from anon;
grant execute on function public.complete_offboarding_run_v1(text) to authenticated;

-- 8j. cancel_offboarding_run_v1 — the person STAYS: honest return to the
-- pre-offboarding stage ('active').
create or replace function public.cancel_offboarding_run_v1(
  p_run_id text,
  p_reason text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_run_id uuid;
  v_reason text := nullif(left(coalesce(p_reason, ''), 500), '');
  v_run    record;
  v_stage  text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_run_id := nullif(trim(coalesce(p_run_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_run_id is null then return 'invalid'; end if;

  select r.id, r.status, r.organization_id, r.engagement_context_id
    into v_run
    from public.offboarding_runs r
   where r.id = v_run_id
   for update;
  if v_run.id is null
     or not (public.manages_organization(v_run.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_run.status <> 'in_progress' then return 'run_closed'; end if;

  update public.offboarding_runs
     set status = 'cancelled', completed_at = now()
   where id = v_run.id;

  select coalesce(ec.lifecycle_stage, 'active') into v_stage
    from public.engagement_contexts ec where ec.id = v_run.engagement_context_id;
  if v_stage = 'offboarding' then
    update public.engagement_contexts
       set lifecycle_stage = 'active', updated_at = now()
     where id = v_run.engagement_context_id;
    insert into public.engagement_lifecycle_events
      (engagement_context_id, actor_profile_id, action, before_stage, after_stage, note, metadata)
    values (v_run.engagement_context_id, uid, 'stage_changed', 'offboarding', 'active',
            v_reason, jsonb_build_object('run_id', v_run.id::text));
  end if;
  insert into public.engagement_lifecycle_events
    (engagement_context_id, actor_profile_id, action, before_stage, after_stage, note, metadata)
  values (v_run.engagement_context_id, uid, 'offboarding_cancelled', v_stage,
          case when v_stage = 'offboarding' then 'active' else v_stage end,
          v_reason, jsonb_build_object('run_id', v_run.id::text));

  return 'cancelled';
end;
$$;
revoke all on function public.cancel_offboarding_run_v1(text, text) from public;
revoke all on function public.cancel_offboarding_run_v1(text, text) from anon;
grant execute on function public.cancel_offboarding_run_v1(text, text) to authenticated;

-- 8k. set_engagement_lifecycle_stage_v1 — probation (stage + date only) and
-- change_pending (stage + note only), per the binding v1 scope. Onboarding /
-- offboarding / ended stages are owned by their run/end commands and are
-- refused here.
create or replace function public.set_engagement_lifecycle_stage_v1(
  p_engagement_context_id text,
  p_stage                 text,
  p_probation_until       text default null,
  p_note                  text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_ec_id uuid;
  v_stage text := nullif(trim(coalesce(p_stage, '')), '');
  v_until date;
  v_note  text := nullif(left(coalesce(p_note, ''), 500), '');
  v_ec    record;
  v_cur   text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_ec_id := nullif(trim(coalesce(p_engagement_context_id, '')), '')::uuid;
    v_until := nullif(trim(coalesce(p_probation_until, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return 'invalid';
  end;
  if v_ec_id is null then return 'invalid'; end if;
  if v_stage is null or v_stage not in ('active','probation','change_pending') then
    return 'invalid';
  end if;
  if v_stage = 'probation' and v_until is null then return 'invalid'; end if;

  select ec.id, ec.organization_id, ec.status, ec.lifecycle_stage
    into v_ec
    from public.engagement_contexts ec
   where ec.id = v_ec_id
   for update;
  if v_ec.id is null then return 'not_found'; end if;
  if v_ec.organization_id is null then
    if public.is_admin() then return 'not_org_scoped'; end if;
    return 'not_found';
  end if;
  if not (public.manages_organization(v_ec.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_ec.status <> 'active' then return 'not_active'; end if;

  v_cur := coalesce(v_ec.lifecycle_stage, 'active');
  if v_cur not in ('active','probation','change_pending') then
    return 'invalid_transition';
  end if;
  if v_cur = v_stage
     and (v_stage <> 'probation') then
    return 'updated'; -- idempotent no-op (probation repeats may move the date)
  end if;

  update public.engagement_contexts
     set lifecycle_stage = v_stage,
         probation_until = case when v_stage = 'probation' then v_until else probation_until end,
         updated_at = now()
   where id = v_ec.id;

  insert into public.engagement_lifecycle_events
    (engagement_context_id, actor_profile_id, action, before_stage, after_stage, note, metadata)
  values (v_ec.id, uid,
          case when v_stage = 'probation' then 'probation_set'
               when v_stage = 'change_pending' then 'change_noted'
               else 'stage_changed' end,
          v_cur, v_stage, v_note,
          case when v_stage = 'probation'
               then jsonb_build_object('probation_until', v_until::text)
               else '{}'::jsonb end);

  return 'updated';
end;
$$;
revoke all on function public.set_engagement_lifecycle_stage_v1(text, text, text, text) from public;
revoke all on function public.set_engagement_lifecycle_stage_v1(text, text, text, text) from anon;
grant execute on function public.set_engagement_lifecycle_stage_v1(text, text, text, text) to authenticated;

-- 8l. end_engagement_lifecycle_v1 — reason/type/note capture AROUND the
-- existing canonical end path. CALLS public.end_org_membership_v1 (its
-- authority ladder, last-owner protection and audit row stay the single
-- truth); on success stamps ended_reason / ended_note / stage='ended' and
-- writes lifecycle history. While an offboarding run is open it refuses —
-- finish or cancel the checklist first. An engagement with NO run can end
-- directly: the canonical path stays unblocked.
create or replace function public.end_engagement_lifecycle_v1(
  p_engagement_context_id text,
  p_reason                text,
  p_note                  text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_ec_id  uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_note   text := nullif(left(coalesce(p_note, ''), 500), '');
  v_stage  text;
  v_res    jsonb;
  v_out    text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_ec_id := nullif(trim(coalesce(p_engagement_context_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_ec_id is null then return 'invalid'; end if;
  if v_reason is null or v_reason not in
     ('resignation','termination','contract_end','mutual_agreement','retirement','other') then
    return 'invalid';
  end if;

  if exists (select 1 from public.offboarding_runs r
              where r.engagement_context_id = v_ec_id and r.status = 'in_progress') then
    return 'offboarding_open';
  end if;

  select coalesce(ec.lifecycle_stage,
                  case when ec.status = 'ended' then 'ended' else 'active' end)
    into v_stage
    from public.engagement_contexts ec
   where ec.id = v_ec_id;
  -- No oracle: a missing row falls through to the canonical RPC, whose
  -- merged 'not_found' posture answers for both.

  -- THE canonical end path (authority ladder + last-owner protection +
  -- audit live there — never forked here).
  v_res := public.end_org_membership_v1(v_ec_id, coalesce(v_note, v_reason));
  v_out := coalesce(v_res->>'outcome', 'error');

  if v_out not in ('ended','already_ended') then
    return v_out; -- not_found / not_org_scoped / not_authorized / last_owner
  end if;

  -- Stamp the lifecycle truth (idempotent; never overwrite an earlier
  -- recorded reason on an already-ended engagement).
  update public.engagement_contexts
     set lifecycle_stage = 'ended',
         ended_reason = coalesce(ended_reason, v_reason),
         ended_note   = coalesce(ended_note, v_note),
         updated_at   = now()
   where id = v_ec_id
     and (lifecycle_stage is distinct from 'ended' or ended_reason is null);

  if v_out = 'ended' then
    insert into public.engagement_lifecycle_events
      (engagement_context_id, actor_profile_id, action, before_stage, after_stage, note, metadata)
    values (v_ec_id, uid, 'engagement_ended', v_stage, 'ended', v_note,
            jsonb_build_object('reason', v_reason));
    insert into public.engagement_lifecycle_events
      (engagement_context_id, actor_profile_id, action, before_stage, after_stage)
    values (v_ec_id, uid, 'stage_changed', v_stage, 'ended');
  end if;

  return v_out;
end;
$$;
revoke all on function public.end_engagement_lifecycle_v1(text, text, text) from public;
revoke all on function public.end_engagement_lifecycle_v1(text, text, text) from anon;
grant execute on function public.end_engagement_lifecycle_v1(text, text, text) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260817190000_employee_lifecycle_v1.down.sql
-- drops the 1 trigger, 16 new functions, 7 new tables and the 4 new
-- engagement_contexts columns. No existing object was touched, so the down
-- file recreates nothing.
