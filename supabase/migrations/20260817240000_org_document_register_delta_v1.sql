-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- OWNER_APPROVAL_REQUIRED_BEFORE_APPLY (apply is performed by the train LEAD
-- via Supabase MCP apply_migration; never `db push`).
-- Gate doc: docs/human-gates/org-document-register-delta-gate.md
-- Rollback:  supabase/rollbacks/20260817240000_org_document_register_delta_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated. Pre-approved by owner mandate
-- 2026-08-17 (autonomous functional completion train V2, §4 migration
-- authority). Safety class: RED by construction — SECURITY DEFINER
-- functions, GRANT/REVOKE, and one check-constraint widening (drop +
-- re-add in the same file, the GREEN widening idiom). Additive only: five
-- NULLABLE columns, one widened constraint that strictly ADMITS MORE, four
-- NEW functions. No existing row is updated or deleted, no existing policy
-- is dropped, and NO function shipped by 20260817140000 is recreated —
-- `create_org_document_v1` stays exactly as merged; the extended contract
-- is a NEW `_v2` (rollback-chain rule).
--
-- ── PROBLEM, MEASURED ───────────────────────────────────────────────────────
-- The org document register (20260817140000, train C) carries the seven org
-- type slugs INCLUDING org_correspondence_incoming / _outgoing, but nothing
-- a correspondence register actually needs: there is no counterparty, no
-- correspondence date and no counterparty reference, so an incoming letter
-- cannot be told apart from an outgoing one by anything except its type
-- slug and nothing records WHO it was with. `work_objects` (train D,
-- 20260817150000) now exists but a document cannot be filed against a site.
-- `retention_until` / `retention_note` were created as columns and have NO
-- writer and NO reader anywhere in the product — dead schema. The register
-- has no search and no filters at all.
--
-- ── SOLUTION (smallest honest slice) ────────────────────────────────────────
--   1. FOUR additive nullable register columns, each a fact nothing else
--      carries: `counterparty_name`, `correspondence_date`,
--      `counterparty_reference`, `object_id` (FK work_objects).
--   2. NO `correspondence_direction` column. Direction is DERIVABLE from
--      the type slug (org_correspondence_incoming -> incoming,
--      org_correspondence_outgoing -> outgoing) and storing it again would
--      create a second, divergable truth. The read layer derives it
--      (`correspondenceDirectionForSlug`, apps/web/lib/documents/
--      document-file-model.ts) — doctrine: never store derivable data twice.
--   3. NO `our_reference` column. `external_ref` (train C, already written
--      by create_org_document_v1 and already rendered in the register row)
--      IS the organization's own reference for the entry; a second column
--      holding the same fact is the same doctrine violation. Only the
--      COUNTERPARTY's reference is genuinely missing, so exactly that is
--      added, named `counterparty_reference` so no phantom `our_reference`
--      is implied.
--   4. `approval_state` — a NULLABLE MIRROR of the EXISTING Workflow &
--      Approval Engine (20260817130000). This migration adds NO approval
--      mechanism: `submit_org_document_for_approval_v1` flips the mirror
--      ONLY when a real pending `workflow_instances` row for this document
--      already exists, and `sync_org_document_approval_v1` is idempotent
--      read-repair from the engine's terminal states. Exactly the
--      agreements (20260817200000) consumer pattern.
--   5. `create_org_document_v2` — v1's contract PLUS the four new fields and
--      the two retention fields, with same-org validation for `object_id`.
--      v1 is untouched and still callable.
--   6. `set_org_document_retention_v1` — the FIRST writer for
--      retention_until / retention_note, so the surfaced retention column is
--      real data and not a permanently empty cell.
--
-- ── ENGINE CONTEXT DECISION, STATED EXPLICITLY ──────────────────────────────
-- The instance context is `generic_request`, chosen from the engine's
-- CLOSED vocabulary. This migration does NOT widen that vocabulary (it is
-- the engine owner's schema). `document_ack` was rejected: it names the
-- version-bound READ CONFIRMATION act (document_acknowledgements), a
-- different thing from approving the register entry, and reusing it would
-- (a) conflate two facts and (b) collide on the engine's
-- `workflow_instances_active_context_uq` unique index the moment one
-- document needs both an acknowledgement workflow and an approval workflow.
-- `management_decision` was rejected as a guess at another module's
-- semantics. `generic_request` is the vocabulary's own honest default.
--
-- ── WHAT IS DELIBERATELY NOT ADDED ──────────────────────────────────────────
-- NO retention auto-deletion, NO scheduled purge, NO destructive job of any
-- kind — retention is RECORD-KEEPING metadata only and deletion stays an
-- owner-gated act (train C doctrine, unchanged). NO OCR, NO full-text
-- search inside files, NO tsvector column and NO search extension (the
-- repo has no tsvector precedent; register search is a bounded ILIKE over
-- the metadata columns). NO new engine context type. NO edit of an existing
-- register entry's identity fields (a v2 create + the two narrow commands
-- only). NO correspondence fields on non-correspondence types — the RPC
-- rejects them rather than storing a meaningless value. NO new route: every
-- surface hangs off the EXISTING /dashboard/documents register section.
--
-- ── RLS DECISION, STATED EXPLICITLY ─────────────────────────────────────────
--   anon:          NOTHING. Every new function is revoked from public and
--                  anon; no policy is created, widened or dropped here.
--   authenticated: unchanged. The new columns ride the EXISTING
--                  `org_documents_select` policy (can_read_org_document_v1)
--                  — a reader who may not see the row still may not see any
--                  of its new columns. Writes stay RPC-only (the train C
--                  revoke of insert/update/delete is untouched).
--   Authority:     create_org_document_v2 / set_org_document_retention_v1 /
--                  submit_org_document_for_approval_v1 require
--                  org_owner_admin_v1 (or is_admin), exactly as v1.
--                  sync_org_document_approval_v1 is convergence, not
--                  discretion: anyone who may READ the row may repair its
--                  mirror (the agreements precedent).
--   Cross-org:     object_id is validated to belong to the SAME
--                  organization as the document; the workflow instance is
--                  matched on organization_id as well as context id.
--
-- ── ROLLBACK: supabase/rollbacks/20260817240000_org_document_register_delta_v1.down.sql
-- (reverse SQL: drop the four new functions, restore the
-- org_document_events event_type constraint, drop the five added columns —
-- 0-row guarded, refuses while any of them holds real data.)
-- ============================================================================

begin;

-- ── 0. Hard dependencies (fail loudly, never half-apply) ───────────────────
do $$
begin
  if to_regclass('public.org_documents') is null then
    raise exception 'org_documents missing — apply 20260817140000_document_file_layer_v1 before this migration';
  end if;
  if to_regclass('public.work_objects') is null then
    raise exception 'work_objects missing — apply 20260817150000_work_objects_v1 before this migration';
  end if;
  if to_regclass('public.workflow_instances') is null then
    raise exception 'workflow_instances missing — apply 20260817130000_workflow_engine_v1 before this migration';
  end if;
end $$;

-- ── 1. Additive nullable register columns ──────────────────────────────────
alter table public.org_documents
  add column if not exists counterparty_name text
    check (counterparty_name is null
           or char_length(counterparty_name) between 1 and 200),
  add column if not exists correspondence_date date,
  add column if not exists counterparty_reference text
    check (counterparty_reference is null
           or char_length(counterparty_reference) between 1 and 120),
  add column if not exists object_id uuid references public.work_objects(id),
  add column if not exists approval_state text
    check (approval_state is null
           or approval_state in ('submitted','approved','returned'));

comment on column public.org_documents.counterparty_name is
  'Correspondence only: the other party of an incoming/outgoing letter. NULL on every non-correspondence type (enforced by create_org_document_v2).';
comment on column public.org_documents.correspondence_date is
  'Correspondence only: the date the letter was sent/received, which is NOT created_at (a letter is registered after the fact).';
comment on column public.org_documents.counterparty_reference is
  'Correspondence only: the COUNTERPARTY reference. The organization''s OWN reference is external_ref (train C) — deliberately not duplicated as an our_reference column.';
comment on column public.org_documents.object_id is
  'Optional site/object this document is filed against (work_objects, train D). Validated same-organization by create_org_document_v2.';
comment on column public.org_documents.approval_state is
  'NULLABLE MIRROR of the Workflow & Approval Engine (context_entity_type=''generic_request''). NULL = no approval was ever requested. This column never decides anything: submit_org_document_for_approval_v1 requires a real pending instance and sync_org_document_approval_v1 converges it onto the engine''s terminal truth.';

create index if not exists org_documents_correspondence_idx
  on public.org_documents (organization_id, correspondence_date desc)
  where correspondence_date is not null;
create index if not exists org_documents_object_idx
  on public.org_documents (object_id)
  where object_id is not null;
create index if not exists org_documents_retention_idx
  on public.org_documents (organization_id, retention_until)
  where retention_until is not null;

-- ── 2. Widen the append-only event vocabulary (drop + re-add, admits MORE) ──
alter table public.org_document_events
  drop constraint org_document_events_event_type_check;
alter table public.org_document_events
  add constraint org_document_events_event_type_check
  check (event_type in
    ('created','file_uploaded','archived','revoked',
     'ack_assigned','acknowledged','downloaded',
     'retention_set','approval_submitted','approval_synced'));

-- ── 3. create_org_document_v2 — v1 plus correspondence / object / retention ─
-- v1 is NOT recreated (rollback-chain rule). The app layer calls v2 and, if
-- v2 is absent in an environment, falls back to v1 ONLY when no v2-only
-- field was supplied — a supplied field is never silently dropped.
create or replace function public.create_org_document_v2(
  p_organization_id uuid,
  p_document_type_slug text,
  p_title text,
  p_description text,
  p_classification text,
  p_worker_id text,
  p_project_id text,
  p_valid_from text,
  p_expires_on text,
  p_external_ref text,
  p_responsible_profile_id text,
  p_object_id text,
  p_counterparty_name text,
  p_correspondence_date text,
  p_counterparty_reference text,
  p_retention_until text,
  p_retention_note text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid              uuid := auth.uid();
  v_title          text := nullif(trim(coalesce(p_title, '')), '');
  v_description    text := nullif(trim(coalesce(p_description, '')), '');
  v_classification text := coalesce(nullif(trim(coalesce(p_classification, '')), ''), 'standard');
  v_external_ref   text := nullif(trim(coalesce(p_external_ref, '')), '');
  v_counterparty   text := nullif(trim(coalesce(p_counterparty_name, '')), '');
  v_their_ref      text := nullif(trim(coalesce(p_counterparty_reference, '')), '');
  v_ret_note       text := nullif(trim(coalesce(p_retention_note, '')), '');
  v_worker         uuid;
  v_project        uuid;
  v_object         uuid;
  v_responsible    uuid;
  v_from           date;
  v_expires        date;
  v_corr_date      date;
  v_retention      date;
  is_correspondence boolean;
  open_count       integer;
  row_id           uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_organization_id is null
     or not (public.org_owner_admin_v1(p_organization_id) or public.is_admin()) then
    -- One answer, no existence leak.
    return 'not_allowed';
  end if;
  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 200 then
    return 'invalid';
  end if;
  if v_description is not null and char_length(v_description) > 2000 then
    return 'invalid';
  end if;
  if v_classification not in ('standard','classified') then
    return 'invalid';
  end if;
  if v_external_ref is not null and char_length(v_external_ref) > 200 then
    return 'invalid';
  end if;
  if v_counterparty is not null and char_length(v_counterparty) > 200 then
    return 'invalid';
  end if;
  if v_their_ref is not null and char_length(v_their_ref) > 120 then
    return 'invalid';
  end if;
  if v_ret_note is not null and char_length(v_ret_note) > 500 then
    return 'invalid';
  end if;
  if not exists (select 1 from public.document_types dt
                  where dt.slug = p_document_type_slug
                    and dt.is_active
                    and dt.category = 'organization') then
    return 'invalid';
  end if;

  -- Direction is derived from the slug and is never stored; the same slug
  -- test decides whether correspondence fields are meaningful at all.
  is_correspondence := p_document_type_slug in
    ('org_correspondence_incoming','org_correspondence_outgoing');

  begin
    v_worker      := nullif(trim(coalesce(p_worker_id, '')), '')::uuid;
    v_project     := nullif(trim(coalesce(p_project_id, '')), '')::uuid;
    v_object      := nullif(trim(coalesce(p_object_id, '')), '')::uuid;
    v_responsible := nullif(trim(coalesce(p_responsible_profile_id, '')), '')::uuid;
    v_from        := nullif(trim(coalesce(p_valid_from, '')), '')::date;
    v_expires     := nullif(trim(coalesce(p_expires_on, '')), '')::date;
    v_corr_date   := nullif(trim(coalesce(p_correspondence_date, '')), '')::date;
    v_retention   := nullif(trim(coalesce(p_retention_until, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return 'invalid';
  end;

  -- A correspondence fact on a policy/procedure row would be a meaningless
  -- value in the register: refuse it instead of storing it.
  if not is_correspondence
     and (v_counterparty is not null
          or v_their_ref is not null
          or v_corr_date is not null) then
    return 'invalid';
  end if;

  if v_worker is not null
     and not exists (select 1 from public.workers w where w.id = v_worker) then
    return 'invalid';
  end if;
  if v_project is not null
     and not exists (select 1 from public.projects p where p.id = v_project) then
    return 'invalid';
  end if;
  -- Same-org validation: a document may only be filed against an object of
  -- the SAME organization (never a client-supplied id from elsewhere).
  if v_object is not null and not exists (
       select 1 from public.work_objects o
        where o.id = v_object
          and o.organization_id = p_organization_id) then
    return 'invalid';
  end if;
  if v_responsible is not null and not exists (
       select 1 from public.company_memberships m
        where m.profile_id = v_responsible
          and m.organization_id = p_organization_id
          and m.status = 'active') then
    return 'invalid';
  end if;

  -- Abuse cap: bounded register per organization (same cap as v1).
  select count(*) into open_count
    from public.org_documents od
   where od.organization_id = p_organization_id
     and od.status <> 'revoked';
  if open_count >= 500 then
    return 'limit_reached';
  end if;

  insert into public.org_documents
      (organization_id, document_type_slug, title, description, classification,
       responsible_profile_id, project_id, worker_id, external_ref,
       valid_from, expires_on, created_by,
       object_id, counterparty_name, correspondence_date,
       counterparty_reference, retention_until, retention_note)
    values
      (p_organization_id, p_document_type_slug, v_title, v_description,
       v_classification, v_responsible, v_project, v_worker, v_external_ref,
       v_from, v_expires, uid,
       v_object, v_counterparty, v_corr_date,
       v_their_ref, v_retention, v_ret_note)
    returning id into row_id;

  insert into public.org_document_events
      (org_document_id, actor_id, event_type, after_state)
    values (row_id, uid, 'created',
            jsonb_build_object('title', v_title,
              'document_type_slug', p_document_type_slug,
              'classification', v_classification,
              'object_id', v_object,
              'counterparty_name', v_counterparty));
  return 'created';
end $$;
revoke all on function public.create_org_document_v2(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.create_org_document_v2(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) from anon;
grant execute on function public.create_org_document_v2(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- ── 4. set_org_document_retention_v1 — the retention columns' first writer ──
-- Record-keeping ONLY. Nothing in this function, this migration or this
-- product deletes a document or a file when retention_until passes; the
-- register merely says what the organization decided. Deletion stays an
-- owner-gated act performed outside the product.
create or replace function public.set_org_document_retention_v1(
  p_org_document_id uuid,
  p_retention_until text,
  p_retention_note text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  doc        public.org_documents%rowtype;
  v_note     text := nullif(trim(coalesce(p_retention_note, '')), '');
  v_until    date;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    return 'invalid';
  end if;
  begin
    v_until := nullif(trim(coalesce(p_retention_until, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return 'invalid';
  end;

  select * into doc from public.org_documents od
   where od.id = p_org_document_id
   for update;
  if doc.id is null
     or not (public.org_owner_admin_v1(doc.organization_id) or public.is_admin()) then
    -- One answer, no existence leak.
    return 'not_found';
  end if;

  update public.org_documents
     set retention_until = v_until,
         retention_note  = v_note,
         updated_at      = now()
   where id = doc.id;

  insert into public.org_document_events
      (org_document_id, actor_id, event_type, before_state, after_state)
    values (doc.id, uid, 'retention_set',
            jsonb_build_object('retention_until', doc.retention_until,
                               'retention_note', doc.retention_note),
            jsonb_build_object('retention_until', v_until,
                               'retention_note', v_note));
  return 'updated';
end $$;
revoke all on function public.set_org_document_retention_v1(uuid, text, text) from public;
revoke all on function public.set_org_document_retention_v1(uuid, text, text) from anon;
grant execute on function public.set_org_document_retention_v1(uuid, text, text) to authenticated;

-- ── 5. submit_org_document_for_approval_v1 — MIRROR flip only ──────────────
-- The app layer starts the instance through the ENGINE's own
-- start_workflow_instance_v1 first; this command refuses unless that
-- instance really exists and is pending. It never approves anything.
create or replace function public.submit_org_document_for_approval_v1(
  p_org_document_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  doc public.org_documents%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into doc from public.org_documents od
   where od.id = p_org_document_id
   for update;
  if doc.id is null
     or not (public.org_owner_admin_v1(doc.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if doc.status <> 'active' then
    return 'invalid_state';
  end if;
  if doc.approval_state in ('submitted','approved') then
    return 'invalid_state';
  end if;
  if not exists (
    select 1 from public.workflow_instances i
     where i.context_entity_type = 'generic_request'
       and i.context_entity_id = doc.id
       and i.organization_id = doc.organization_id
       and i.status = 'pending'
  ) then
    return 'no_pending_workflow';
  end if;

  update public.org_documents
     set approval_state = 'submitted', updated_at = now()
   where id = doc.id;

  insert into public.org_document_events
      (org_document_id, actor_id, event_type, before_state, after_state)
    values (doc.id, uid, 'approval_submitted',
            jsonb_build_object('approval_state', doc.approval_state),
            jsonb_build_object('approval_state', 'submitted'));
  return 'submitted';
end $$;
revoke all on function public.submit_org_document_for_approval_v1(uuid) from public;
revoke all on function public.submit_org_document_for_approval_v1(uuid) from anon;
grant execute on function public.submit_org_document_for_approval_v1(uuid) to authenticated;

-- ── 6. sync_org_document_approval_v1 — idempotent READ-REPAIR ──────────────
-- Convergence, not discretion: it only copies what the engine already
-- decided onto the mirror. Anyone who may VIEW the document may repair it.
create or replace function public.sync_org_document_approval_v1(
  p_org_document_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  doc      public.org_documents%rowtype;
  v_state  text;
  v_target text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into doc from public.org_documents od
   where od.id = p_org_document_id;
  if doc.id is null or not public.can_read_org_document_v1(p_org_document_id) then
    return 'not_found';
  end if;
  if doc.approval_state is distinct from 'submitted' then
    return 'unchanged';
  end if;

  select i.status into v_state
    from public.workflow_instances i
   where i.context_entity_type = 'generic_request'
     and i.context_entity_id = doc.id
     and i.organization_id = doc.organization_id
   order by i.created_at desc
   limit 1;

  if v_state = 'pending' then
    return 'unchanged';
  elsif v_state = 'approved' then
    v_target := 'approved';
  else
    -- rejected / withdrawn / cancelled / no instance at all: back to "no
    -- approval on record", stated as 'returned' (never silently approved).
    v_target := 'returned';
  end if;

  update public.org_documents
     set approval_state = v_target, updated_at = now()
   where id = doc.id;

  insert into public.org_document_events
      (org_document_id, actor_id, event_type, before_state, after_state)
    values (doc.id, uid, 'approval_synced',
            jsonb_build_object('approval_state', 'submitted'),
            jsonb_build_object('approval_state', v_target,
                               'workflow_state', coalesce(v_state, 'missing')));
  return case when v_target = 'approved'
              then 'repaired_approved' else 'repaired_returned' end;
end $$;
revoke all on function public.sync_org_document_approval_v1(uuid) from public;
revoke all on function public.sync_org_document_approval_v1(uuid) from anon;
grant execute on function public.sync_org_document_approval_v1(uuid) to authenticated;

commit;

-- ROLLBACK (reverse SQL — see the paired down file
-- supabase/rollbacks/20260817240000_org_document_register_delta_v1.down.sql):
-- drop sync_org_document_approval_v1, submit_org_document_for_approval_v1,
-- set_org_document_retention_v1 and create_org_document_v2; restore the
-- org_document_events event_type check constraint to the train C list;
-- drop the org_documents_retention_idx / org_documents_object_idx /
-- org_documents_correspondence_idx indexes; drop the columns
-- approval_state, object_id, counterparty_reference, correspondence_date
-- and counterparty_name — each preceded by a 0-row assertion guard so the
-- rollback REFUSES while any of them holds real data.
