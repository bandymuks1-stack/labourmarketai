-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after the lead session's
-- verification. Never `db push`.
-- Gate doc: docs/human-gates/training-certification-gate.md
-- Rollback:  supabase/rollbacks/20260817230000_training_certification_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- GRANTs + new RLS-bearing tables + triggers are RED-class; there is no
-- non-RED way to add a row-level-secured register). Annotation pre-approved
-- by owner mandate 2026-08-17 (autonomous functional completion train V2,
-- §4 migration authority). SAFETY CLASS: RED — 4 new tables, 1 visibility
-- helper + 7 new SECURITY DEFINER commands, 2 append-only / fill-once
-- trigger guards, EXECUTE grants. ZERO existing table, column, constraint,
-- policy, grant, trigger or function is modified or recreated. ZERO DML at
-- apply time. Prod apply stays manual by the LEAD session.
--
-- 20260817230000 — Training & Certification v1.
--
-- PROBLEM (full reality audit 2026-08-17, OPERATIONS):
--   training       PARTIAL — self-declared courses/certs only; the repo
--                  honestly states "no training surface".
--   certifications PARTIAL — two `document_types` qualification slugs with
--                  expiry derivation + admin verification, but no register
--                  that answers "who in this organization holds which
--                  certificate, and when does it lapse?".
--   There is no way for an organization to say "these people must complete
--   this training by this date" and to hold the evidence afterwards.
--
-- SOLUTION (smallest honest slice, built on engines that already exist):
--   * training_programs — an org owner/admin authors a reusable programme.
--     Its MATERIAL is not a new file layer: `material_document_id` points at
--     an EXISTING `org_documents` row (Document & Evidence Engine v1).
--   * training_assignments — one subject, one programme, one required-by
--     date. The subject key is `assignee_profile_id` (see SUBJECT KEY below).
--     Completion is self-only and FILL-ONCE (RPC + trigger).
--   * training_assignment_events — append-only audit ledger (trigger-enforced,
--     the disclosure-ledger precedent).
--   * training_skill_links — an HONEST, training-provenanced linkage row.
--     See SKILL SEAM below: this is deliberately NOT a write into the
--     canonical skill model.
--
-- SUBJECT KEY — `assignee_profile_id`, JUSTIFIED:
--   The acknowledgement of a training MATERIAL is NOT re-implemented here;
--   it rides `public.document_acknowledgements`, whose subject key is
--   `assignee_profile_id`. A training assignment keyed on `worker_id` could
--   never join its own material acknowledgement without a lossy hop through
--   `workers.profile_id` — and would silently exclude every org member who
--   holds no `workers` row (office staff, managers, external managers), who
--   are exactly the people an org assigns policy/safety training to. The
--   certification register therefore joins OUT to `workers` /
--   `worker_documents` (read-only) when the assignee happens to be a worker,
--   rather than keying IN on it.
--
-- ACKNOWLEDGEMENT REUSE — BINDING: there is NO second acknowledgement
--   mechanism in this migration. `assign_document_acknowledgement_v1` and
--   `acknowledge_document_v1` (20260817140000) remain the ONLY way a person
--   confirms they have read a training material, bound to the exact FILE
--   VERSION. This module links to that truth; it never mirrors it.
--
-- SKILL SEAM — INVESTIGATED, DELIBERATELY NOT CROSSED:
--   The canonical skill model is `public.worker_skills`, whose provenance
--   column carries a CLOSED check constraint
--     worker_skills_source_check: source in
--       ('self_declared','work_journal','manager_confirmed')
--   (supabase/migrations/0010_skills_and_worker_skills.sql:41-54), and the
--   canonical evidence-link table `public.journal_entry_skills` requires a
--   NOT NULL `journal_entry_id` (20260602120000). A training completion is
--   neither a journal entry nor any of the three admitted provenances, so
--   writing training evidence into either would require EITHER widening the
--   canonical constraint OR minting a fake journal entry. Both are refused.
--   `training_skill_links` therefore records the linkage in THIS module's
--   own table, honestly provenanced, with ZERO write to worker_skills and
--   ZERO write to journal_entry_skills (asserted by the guard test). A
--   certificate is EVIDENCE THAT A COURSE WAS COMPLETED — never a claim of
--   demonstrated competence; the copy layer says exactly that. Admitting a
--   'training_certified' provenance into the canonical ladder is a LATER
--   train and an owner decision.
--
-- EXPIRY: derived, never stored as a state. `expires_on` is a plain date;
--   the 30-day "expiring soon" window is a RENDER-TIME derivation reusing
--   the existing worker-document pattern. `status = 'expired'` is only ever
--   reached through the explicit RPC (a manager marking it), never by a
--   background job. NO notification constraint is touched: the EXISTING
--   `document_expiring` type (20260817140100) already covers document
--   expiry; no new type is invented, no CHECK is widened.
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   - NO tests / quizzes / assessments / scoring of any kind. The audit
--     records that omission as DELIBERATE doctrine ("skill truth = evidence
--     + confirmation") and this migration honours it.
--   - NO second acknowledgement mechanism, NO second file layer, NO second
--     approval engine.
--   - NO write to worker_skills / journal_entry_skills / worker_documents.
--   - NO cron, NO scheduler, NO auto-expiry job.
--   - NO AI anywhere.
--   - NO external sending of any kind.
--
-- RLS DECISION, STATED EXPLICITLY:
--   anon:           NOTHING. No grant, no policy.
--   authenticated:  SELECT only, fail-closed —
--     training_programs: any ACTIVE member of the org (governance truth) or
--       platform admin;
--     training_assignments / _events / training_skill_links: the assignee,
--       the person who assigned, an org MANAGING role
--       (public.has_org_demand_access — owner/admin/manager/external_manager),
--       or platform admin — ONE definer predicate,
--       training_can_view_assignment_v1, shared by three tables (the assets
--       recursion precedent).
--     Writes: NO insert/update/delete policy on ANY table and an explicit
--       REVOKE — the 7 gated commands are the only write paths.
--   service_role:   untouched default.
--
-- ROLLBACK: supabase/rollbacks/20260817230000_training_certification_v1.down.sql
-- drops ONLY the 2 triggers, 8 new functions and 4 new tables, and REFUSES
-- while real rows exist (0-row guard). No existing object is touched here,
-- so the down file recreates nothing.
-- ============================================================================

begin;

-- ── 0. Safety assertions — the truths this module builds on must exist ─────
do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'organizations missing — this environment predates the org spine';
  end if;
  if to_regclass('public.org_documents') is null then
    raise exception 'org_documents missing — apply 20260817140000_document_file_layer_v1 before this migration';
  end if;
  if to_regclass('public.document_files') is null then
    raise exception 'document_files missing — apply 20260817140000_document_file_layer_v1 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'has_org_demand_access'
  ) then
    raise exception 'has_org_demand_access missing — apply 20260806200000 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'org_owner_admin_v1'
  ) then
    raise exception 'org_owner_admin_v1 missing — apply 20260817140000 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'belongs_to_organization'
  ) then
    raise exception 'belongs_to_organization missing — apply 20260806120000 before this migration';
  end if;
end $$;

-- ── 1. Tables ──────────────────────────────────────────────────────────────

-- 1a. Reusable programme. The MATERIAL is an existing org_documents row.
create table if not exists public.training_programs (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  title                text not null check (char_length(trim(title)) >= 3 and char_length(title) <= 160),
  description          text check (description is null or char_length(description) <= 2000),
  -- Training MATERIAL: the Document & Evidence Engine's org register row.
  -- Acknowledgement of that material rides document_acknowledgements — this
  -- module never re-implements it.
  material_document_id uuid references public.org_documents(id) on delete set null,
  is_active            boolean not null default true,
  created_by           uuid not null references public.profiles(id) on delete cascade,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists training_programs_org_idx
  on public.training_programs (organization_id, created_at desc);

comment on column public.training_programs.material_document_id is
  'Pointer to the EXISTING org_documents register row that holds the training material. Acknowledgement of that material is document_acknowledgements'' job (20260817140000) — never duplicated here.';

-- 1b. One subject, one programme. Completion is self-only and fill-once.
create table if not exists public.training_assignments (
  id                            uuid primary key default gen_random_uuid(),
  program_id                    uuid not null references public.training_programs(id) on delete cascade,
  organization_id               uuid not null references public.organizations(id) on delete cascade,
  -- SUBJECT KEY: profile, not worker — see the header's SUBJECT KEY section.
  assignee_profile_id           uuid not null references public.profiles(id) on delete cascade,
  required_by                   date,
  status                        text not null default 'assigned'
                                  check (status in ('assigned','completed','expired')),
  completed_at                  timestamptz,
  completion_note               text check (completion_note is null or char_length(completion_note) <= 1000),
  -- Certificate evidence: an EXISTING document_files version row. The file
  -- layer is the document engine's; nothing is stored here but the pointer.
  certificate_document_file_id  uuid references public.document_files(id) on delete set null,
  issued_on                     date,
  expires_on                    date,
  assigned_by                   uuid not null references public.profiles(id) on delete cascade,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint training_assignments_once unique (program_id, assignee_profile_id),
  -- 'assigned' has no completion stamp; 'completed' always has one; an
  -- 'expired' record may or may not have been completed before it lapsed
  -- (a certification can expire whether or not the course was finished).
  constraint training_assignments_completed_shape check (
    (status = 'assigned'  and completed_at is null)
    or (status = 'completed' and completed_at is not null)
    or (status = 'expired')
  ),
  constraint training_assignments_certificate_shape check (
    (certificate_document_file_id is null and issued_on is null)
    or (certificate_document_file_id is not null and issued_on is not null)
  ),
  constraint training_assignments_expiry_order check (
    expires_on is null or issued_on is null or expires_on >= issued_on
  )
);
create index if not exists training_assignments_program_idx
  on public.training_assignments (program_id, created_at desc);
create index if not exists training_assignments_assignee_idx
  on public.training_assignments (assignee_profile_id, created_at desc);
create index if not exists training_assignments_org_status_idx
  on public.training_assignments (organization_id, status);
create index if not exists training_assignments_expiry_idx
  on public.training_assignments (organization_id, expires_on)
  where expires_on is not null;

comment on column public.training_assignments.certificate_document_file_id is
  'Evidence that a course was COMPLETED. It is never a claim of demonstrated competence — the skill ladder stays evidence-and-confirmation based (see training_skill_links).';

-- 1c. Append-only audit ledger.
create table if not exists public.training_assignment_events (
  id                    uuid primary key default gen_random_uuid(),
  training_assignment_id uuid not null references public.training_assignments(id) on delete cascade,
  actor_id              uuid not null references public.profiles(id),
  event_type            text not null check (event_type in
                          ('assigned','completed','certificate_attached',
                           'marked_expired','reopened','skill_linked')),
  before_state          jsonb check (before_state is null or pg_column_size(before_state) <= 2048),
  after_state           jsonb check (after_state is null or pg_column_size(after_state) <= 2048),
  created_at            timestamptz not null default now()
);
create index if not exists training_assignment_events_assignment_idx
  on public.training_assignment_events (training_assignment_id, created_at);

comment on table public.training_assignment_events is
  'APPEND-ONLY training audit ledger. Rows are immutable (trigger-enforced for every role incl. service_role).';

-- 1d. HONEST, training-provenanced skill linkage — this module's OWN table.
-- It is NOT a worker_skills row, NOT a journal_entry_skills row and carries
-- NO level, NO score and NO verified flag. It records only: "this completed
-- training, which carries a certificate, was recorded against this skill".
create table if not exists public.training_skill_links (
  id                     uuid primary key default gen_random_uuid(),
  training_assignment_id uuid not null references public.training_assignments(id) on delete cascade,
  skill_id               uuid not null references public.skills(id) on delete cascade,
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  -- Fixed, single-valued provenance: this table can say nothing else.
  provenance             text not null default 'training_completion'
                           check (provenance = 'training_completion'),
  created_by             uuid not null references public.profiles(id) on delete cascade,
  created_at             timestamptz not null default now(),
  constraint training_skill_links_once unique (training_assignment_id, skill_id)
);
create index if not exists training_skill_links_skill_idx
  on public.training_skill_links (skill_id);

comment on table public.training_skill_links is
  'Training-provenanced skill linkage. NOT a competence claim and NOT part of the canonical skill ladder: worker_skills and journal_entry_skills are never written by this module (worker_skills_source_check is a closed vocabulary; journal_entry_skills requires a real journal entry). Admitting a training provenance into the canonical ladder is a later train and an owner decision.';

-- ── 2. Trigger guards ──────────────────────────────────────────────────────

-- 2a. The event ledger is append-only forever.
create or replace function public.training_events_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'training_assignment_events is append-only: % is not allowed', tg_op;
end;
$$;
drop trigger if exists training_assignment_events_append_only on public.training_assignment_events;
create trigger training_assignment_events_append_only
  before update or delete on public.training_assignment_events
  for each row execute function public.training_events_guard();

-- 2b. Completion is FILL-ONCE and the subject never moves. A completed
-- assignment may still gain a certificate or be marked expired by a
-- manager, but its completion stamp is immutable.
create or replace function public.training_assignment_fill_once_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
    or new.program_id is distinct from old.program_id
    or new.organization_id is distinct from old.organization_id
    or new.assignee_profile_id is distinct from old.assignee_profile_id
  then
    raise exception 'training assignment identity is immutable';
  end if;
  if old.completed_at is not null
     and new.completed_at is distinct from old.completed_at then
    raise exception 'training completion is fill-once: the completion stamp is immutable';
  end if;
  if old.completion_note is not null
     and new.completion_note is distinct from old.completion_note then
    raise exception 'training completion note is fill-once';
  end if;
  return new;
end;
$$;
drop trigger if exists training_assignments_fill_once on public.training_assignments;
create trigger training_assignments_fill_once
  before update on public.training_assignments
  for each row execute function public.training_assignment_fill_once_guard();

-- ── 3. Visibility helper (SECURITY DEFINER, recursion-free policies) ───────
create or replace function public.training_can_view_assignment_v1(p_assignment_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.training_assignments a
     where a.id = p_assignment_id
       and (
         a.assignee_profile_id = auth.uid()
         or a.assigned_by = auth.uid()
         or public.has_org_demand_access(a.organization_id)
         or public.is_admin()
       )
  )
$$;
revoke all on function public.training_can_view_assignment_v1(uuid) from public;
revoke all on function public.training_can_view_assignment_v1(uuid) from anon;
grant execute on function public.training_can_view_assignment_v1(uuid) to authenticated;

-- ── 4. RLS — SELECT-only, fail-closed; writes stay RPC-only ────────────────

alter table public.training_programs enable row level security;
alter table public.training_assignments enable row level security;
alter table public.training_assignment_events enable row level security;
alter table public.training_skill_links enable row level security;

revoke all on public.training_programs,
              public.training_assignments,
              public.training_assignment_events,
              public.training_skill_links
  from public;
revoke all on public.training_programs,
              public.training_assignments,
              public.training_assignment_events,
              public.training_skill_links
  from anon;
revoke all on public.training_programs,
              public.training_assignments,
              public.training_assignment_events,
              public.training_skill_links
  from authenticated;
grant select on public.training_programs,
                public.training_assignments,
                public.training_assignment_events,
                public.training_skill_links
  to authenticated;

drop policy if exists training_programs_select on public.training_programs;
create policy training_programs_select on public.training_programs
  for select to authenticated
  using (public.belongs_to_organization(organization_id) or public.is_admin());

drop policy if exists training_assignments_select on public.training_assignments;
create policy training_assignments_select on public.training_assignments
  for select to authenticated
  using (public.training_can_view_assignment_v1(id));

drop policy if exists training_assignment_events_select on public.training_assignment_events;
create policy training_assignment_events_select on public.training_assignment_events
  for select to authenticated
  using (public.training_can_view_assignment_v1(training_assignment_id));

drop policy if exists training_skill_links_select on public.training_skill_links;
create policy training_skill_links_select on public.training_skill_links
  for select to authenticated
  using (public.training_can_view_assignment_v1(training_assignment_id));

-- No insert/update/delete policy anywhere: with the explicit REVOKE above,
-- the commands below are the ONLY write paths.

-- ── 5. Commands (SECURITY DEFINER, outcome-string contract) ────────────────

-- 5a. create_training_program_v1 — org owner/admin authors a programme.
create or replace function public.create_training_program_v1(
  p_organization_id      text,
  p_title                text,
  p_description          text,
  p_material_document_id text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_org   uuid;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_desc  text := nullif(trim(coalesce(p_description, '')), '');
  v_doc   uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_org := nullif(trim(coalesce(p_organization_id, '')), '')::uuid;
    v_doc := nullif(trim(coalesce(p_material_document_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_org is null then return 'invalid'; end if;

  -- Merged outcome for "org missing" and "no authority" — no oracle.
  if not public.org_owner_admin_v1(v_org) and not public.is_admin() then
    return 'not_authorized';
  end if;

  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 160 then
    return 'invalid';
  end if;
  if v_desc is not null and char_length(v_desc) > 2000 then return 'invalid'; end if;

  -- A material must be an ACTIVE register row of the SAME organization.
  if v_doc is not null and not exists (
    select 1 from public.org_documents od
     where od.id = v_doc and od.organization_id = v_org and od.status = 'active'
  ) then
    return 'invalid_material';
  end if;

  -- Abuse cap: a programme catalogue is a short list, not a data dump.
  if (select count(*) from public.training_programs p
       where p.organization_id = v_org) >= 200 then
    return 'limit_reached';
  end if;

  insert into public.training_programs
    (organization_id, title, description, material_document_id, created_by)
  values (v_org, v_title, v_desc, v_doc, uid);

  return 'created';
end $$;
revoke all on function public.create_training_program_v1(text, text, text, text) from public;
revoke all on function public.create_training_program_v1(text, text, text, text) from anon;
grant execute on function public.create_training_program_v1(text, text, text, text) to authenticated;

-- 5b. update_training_program_v1 — same authority; null args leave a field.
create or replace function public.update_training_program_v1(
  p_program_id           text,
  p_title                text default null,
  p_description          text default null,
  p_material_document_id text default null,
  p_is_active            text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_id    uuid;
  v_doc   uuid;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_desc  text := nullif(trim(coalesce(p_description, '')), '');
  v_act   text := nullif(trim(lower(coalesce(p_is_active, ''))), '');
  prog    public.training_programs%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id  := nullif(trim(coalesce(p_program_id, '')), '')::uuid;
    v_doc := nullif(trim(coalesce(p_material_document_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;
  if v_act is not null and v_act not in ('true','false') then return 'invalid'; end if;

  select * into prog from public.training_programs p where p.id = v_id;
  -- Merged: missing row and no authority answer the same — no oracle.
  if prog.id is null
     or (not public.org_owner_admin_v1(prog.organization_id) and not public.is_admin()) then
    return 'not_found';
  end if;

  if v_title is not null and (char_length(v_title) < 3 or char_length(v_title) > 160) then
    return 'invalid';
  end if;
  if v_desc is not null and char_length(v_desc) > 2000 then return 'invalid'; end if;
  if v_doc is not null and not exists (
    select 1 from public.org_documents od
     where od.id = v_doc and od.organization_id = prog.organization_id
       and od.status = 'active'
  ) then
    return 'invalid_material';
  end if;

  update public.training_programs
     set title                = coalesce(v_title, title),
         description          = coalesce(v_desc, description),
         material_document_id = coalesce(v_doc, material_document_id),
         is_active            = case when v_act is null then is_active else v_act = 'true' end,
         updated_at           = now()
   where id = prog.id;

  return 'updated';
end $$;
revoke all on function public.update_training_program_v1(text, text, text, text, text) from public;
revoke all on function public.update_training_program_v1(text, text, text, text, text) from anon;
grant execute on function public.update_training_program_v1(text, text, text, text, text) to authenticated;

-- 5c. assign_training_v1 — an org MANAGING role assigns a programme to an
-- active member of the same org. The assignee is addressed by email
-- (membership_invite_v1 precedent): foreign, missing and non-member
-- addresses all answer the same outcome — no account oracle.
create or replace function public.assign_training_v1(
  p_program_id     text,
  p_assignee_email text,
  p_required_by    text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_id       uuid;
  v_required date;
  v_target   uuid;
  prog       public.training_programs%rowtype;
  v_new      uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_program_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;
  if nullif(trim(coalesce(p_assignee_email, '')), '') is null then return 'invalid'; end if;
  begin
    v_required := nullif(trim(coalesce(p_required_by, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow
              or invalid_datetime_format then
    return 'invalid';
  end;

  select * into prog from public.training_programs p where p.id = v_id;
  if prog.id is null or not public.has_org_demand_access(prog.organization_id) then
    return 'not_found';  -- merged with missing — no oracle
  end if;
  if not prog.is_active then return 'inactive_program'; end if;

  select p.id into v_target from public.profiles p
   where lower(p.email) = lower(trim(p_assignee_email)) limit 1;
  if v_target is null then return 'invalid_assignee'; end if;
  -- Same-org ACTIVE governance membership is required — one answer for
  -- "no such account" and "not in this organization".
  if not exists (
    select 1 from public.company_memberships m
     where m.profile_id = v_target
       and m.organization_id = prog.organization_id
       and m.status = 'active'
  ) then
    return 'invalid_assignee';
  end if;

  -- Abuse cap: open assignments per organization.
  if (select count(*) from public.training_assignments a
       where a.organization_id = prog.organization_id
         and a.status = 'assigned') >= 5000 then
    return 'limit_reached';
  end if;

  begin
    insert into public.training_assignments
      (program_id, organization_id, assignee_profile_id, required_by, assigned_by)
    values (prog.id, prog.organization_id, v_target, v_required, uid)
    returning id into v_new;
  exception when unique_violation then
    return 'already_assigned';
  end;

  insert into public.training_assignment_events
    (training_assignment_id, actor_id, event_type, after_state)
  values (v_new, uid, 'assigned',
          jsonb_build_object('program_id', prog.id::text,
                             'required_by', v_required));

  return 'assigned';
end $$;
revoke all on function public.assign_training_v1(text, text, text) from public;
revoke all on function public.assign_training_v1(text, text, text) from anon;
grant execute on function public.assign_training_v1(text, text, text) to authenticated;

-- 5d. complete_training_assignment_v1 — the ASSIGNEE only, FILL-ONCE.
-- Nobody may complete a training on somebody else's behalf; the trigger
-- guard enforces the same rule from below.
create or replace function public.complete_training_assignment_v1(
  p_assignment_id text,
  p_note          text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_id   uuid;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
  a      public.training_assignments%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_assignment_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select * into a from public.training_assignments t where t.id = v_id for update;
  -- Merged: missing row and somebody else's assignment answer the same.
  if a.id is null or a.assignee_profile_id <> uid then return 'not_found'; end if;
  if a.completed_at is not null then return 'already_completed'; end if;
  if a.status = 'expired' then return 'invalid_state'; end if;

  update public.training_assignments
     set status = 'completed',
         completed_at = now(),
         completion_note = v_note,
         updated_at = now()
   where id = a.id and completed_at is null;

  insert into public.training_assignment_events
    (training_assignment_id, actor_id, event_type, before_state, after_state)
  values (a.id, uid, 'completed',
          jsonb_build_object('status', a.status),
          jsonb_build_object('status', 'completed'));

  return 'completed';
end $$;
revoke all on function public.complete_training_assignment_v1(text, text) from public;
revoke all on function public.complete_training_assignment_v1(text, text) from anon;
grant execute on function public.complete_training_assignment_v1(text, text) to authenticated;

-- 5e. attach_training_certificate_v1 — an org MANAGING role records the
-- certificate evidence: an EXISTING document_files version row of the same
-- organization. No file is stored here; nothing is uploaded by this
-- function. Only a COMPLETED assignment can carry a certificate.
create or replace function public.attach_training_certificate_v1(
  p_assignment_id      text,
  p_document_file_id   text,
  p_issued_on          text,
  p_expires_on         text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_id      uuid;
  v_file    uuid;
  v_issued  date;
  v_expires date;
  a         public.training_assignments%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id   := nullif(trim(coalesce(p_assignment_id, '')), '')::uuid;
    v_file := nullif(trim(coalesce(p_document_file_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null or v_file is null then return 'invalid'; end if;
  begin
    v_issued  := nullif(trim(coalesce(p_issued_on, '')), '')::date;
    v_expires := nullif(trim(coalesce(p_expires_on, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow
              or invalid_datetime_format then
    return 'invalid';
  end;
  if v_issued is null then return 'invalid'; end if;
  if v_expires is not null and v_expires < v_issued then return 'invalid'; end if;

  select * into a from public.training_assignments t where t.id = v_id for update;
  if a.id is null or not public.has_org_demand_access(a.organization_id) then
    return 'not_found';  -- merged with missing — no oracle
  end if;
  if a.status <> 'completed' then return 'invalid_state'; end if;

  -- The evidence file must be an org-scope version row of the SAME org.
  if not exists (
    select 1
      from public.document_files df
      join public.org_documents od on od.id = df.org_document_id
     where df.id = v_file
       and df.org_document_id is not null
       and od.organization_id = a.organization_id
  ) then
    return 'invalid_file';
  end if;

  update public.training_assignments
     set certificate_document_file_id = v_file,
         issued_on = v_issued,
         expires_on = v_expires,
         updated_at = now()
   where id = a.id;

  insert into public.training_assignment_events
    (training_assignment_id, actor_id, event_type, after_state)
  values (a.id, uid, 'certificate_attached',
          jsonb_build_object('document_file_id', v_file::text,
                             'issued_on', v_issued,
                             'expires_on', v_expires));

  return 'attached';
end $$;
revoke all on function public.attach_training_certificate_v1(text, text, text, text) from public;
revoke all on function public.attach_training_certificate_v1(text, text, text, text) from anon;
grant execute on function public.attach_training_certificate_v1(text, text, text, text) to authenticated;

-- 5f. set_training_assignment_expired_v1 — an org MANAGING role marks a
-- lapsed certification. This is an EXPLICIT human act, never a job: the
-- product does not silently change a person's record in the background.
create or replace function public.set_training_assignment_expired_v1(
  p_assignment_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  v_id uuid;
  a    public.training_assignments%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_assignment_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select * into a from public.training_assignments t where t.id = v_id for update;
  if a.id is null or not public.has_org_demand_access(a.organization_id) then
    return 'not_found';
  end if;
  if a.status = 'expired' then return 'already_expired'; end if;
  -- Only a real, dated expiry can be marked — no arbitrary invalidation.
  if a.expires_on is null then return 'invalid_state'; end if;

  update public.training_assignments
     set status = 'expired', updated_at = now()
   where id = a.id;

  insert into public.training_assignment_events
    (training_assignment_id, actor_id, event_type, before_state, after_state)
  values (a.id, uid, 'marked_expired',
          jsonb_build_object('status', a.status),
          jsonb_build_object('status', 'expired', 'expires_on', a.expires_on));

  return 'expired';
end $$;
revoke all on function public.set_training_assignment_expired_v1(text) from public;
revoke all on function public.set_training_assignment_expired_v1(text) from anon;
grant execute on function public.set_training_assignment_expired_v1(text) to authenticated;

-- 5g. link_training_skill_v1 — records THIS MODULE'S OWN honest linkage.
-- It writes exactly one training_skill_links row and NOTHING ELSE: no
-- worker_skills row, no journal_entry_skills row, no level, no score, no
-- verified flag. Only a COMPLETED assignment that carries a CERTIFICATE may
-- be linked, so the row always points at real recorded evidence.
create or replace function public.link_training_skill_v1(
  p_assignment_id text,
  p_skill_id      text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_id    uuid;
  v_skill uuid;
  a       public.training_assignments%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id    := nullif(trim(coalesce(p_assignment_id, '')), '')::uuid;
    v_skill := nullif(trim(coalesce(p_skill_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null or v_skill is null then return 'invalid'; end if;

  select * into a from public.training_assignments t where t.id = v_id;
  if a.id is null or not public.has_org_demand_access(a.organization_id) then
    return 'not_found';
  end if;
  -- The course must genuinely have been completed AND certified. A LATER
  -- expiry of the certificate does not erase that this happened, so the
  -- condition reads the stamps, not the current status.
  if a.completed_at is null or a.certificate_document_file_id is null then
    return 'invalid_state';
  end if;
  if not exists (select 1 from public.skills s where s.id = v_skill) then
    return 'invalid_skill';
  end if;

  begin
    insert into public.training_skill_links
      (training_assignment_id, skill_id, organization_id, created_by)
    values (a.id, v_skill, a.organization_id, uid);
  exception when unique_violation then
    return 'already_linked';
  end;

  insert into public.training_assignment_events
    (training_assignment_id, actor_id, event_type, after_state)
  values (a.id, uid, 'skill_linked',
          jsonb_build_object('skill_id', v_skill::text));

  return 'linked';
end $$;
revoke all on function public.link_training_skill_v1(text, text) from public;
revoke all on function public.link_training_skill_v1(text, text) from anon;
grant execute on function public.link_training_skill_v1(text, text) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260817230000_training_certification_v1.down.sql
-- refuses while real rows exist (0-row guard), then drops the 2 triggers,
-- 8 new functions and 4 new tables. No existing object was touched, so the
-- down file recreates nothing.
