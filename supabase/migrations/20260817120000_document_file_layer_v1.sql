-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- OWNER_APPROVAL_REQUIRED_BEFORE_APPLY (apply is performed by the train LEAD
-- via Supabase MCP apply_migration; never `db push`).
-- Gate doc: docs/human-gates/document-file-layer-gate.md
-- Rollback:  supabase/rollbacks/20260817120000_document_file_layer_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated. Pre-approved by owner mandate
-- 2026-08-17 (autonomous functional completion train V2, §4 migration
-- authority). Safety class: RED by construction — new RLS-bearing tables,
-- SECURITY DEFINER RPCs, GRANT/REVOKE, storage bucket + storage.objects
-- policies, and two check-constraint widenings (drop + re-add in the same
-- file, the GREEN widening idiom). Additive only: no existing row is
-- updated or deleted, no existing policy/function is dropped, and the two
-- widened constraints strictly ADMIT MORE (every currently-valid row stays
-- valid).
--
-- ── PROBLEM, MEASURED ───────────────────────────────────────────────────────
-- The document registry (20260610170000) is metadata-only: worker_documents
-- has a `file_path` column with NO writer, there is no bucket for document
-- files, and the UI carries an honest "file upload is not available yet"
-- note. Organizations have NO document register at all — no place for
-- policies, procedures, instructions or correspondence, no version truth,
-- and no way to ask a person to confirm they have read a document.
--
-- ── SOLUTION (smallest honest slice) ────────────────────────────────────────
--   1. `document_files` — version rows, THE file truth for both scopes.
--      worker_documents stays canonical for the worker scope (no data
--      migration, no parallel registry); `org_documents` is the NEW
--      org-scope register with its own append-only `org_document_events`.
--   2. `document_acknowledgements` — version-bound, fill-once read
--      confirmations. Acknowledging version N NEVER covers version N+1
--      (the FK is to document_files, not to the register row).
--   3. One PRIVATE storage bucket `document-files` with path-prefix-scoped
--      storage.objects policies mirroring the journal-entry-photos
--      precedent; every policy delegates to the document_files/RLS truth.
--   4. SECURITY DEFINER RPCs as the ONLY write paths (direct writes
--      revoked), each re-checking authority server-side.
--
-- ── WHAT IS DELIBERATELY NOT ADDED ──────────────────────────────────────────
-- No OCR, no e-signature, no retention auto-deletion (owner-gated
-- destructive), no full-text search inside files, no migration of
-- worker_documents rows, no public bucket, no anon grant of anything.
-- worker_documents.file_path stays DEAD on purpose — document_files is the
-- single file truth (doctrine: never store derivable data twice).
-- Hard-deleting files stays owner-gated: revoke keeps every version.
--
-- ── RLS DECISION, STATED EXPLICITLY ─────────────────────────────────────────
--   anon:           NOTHING anywhere. No grant, no policy, RPCs revoked.
--   authenticated:  SELECT only, scoped:
--     org_documents            — can_read_org_document_v1: org owner/admin
--                                membership, the responsible person, a
--                                version-bound acknowledgement assignee, or
--                                (ACTIVE + 'standard' classification docs
--                                only) any active org member. Admin.
--     org_document_events      — document managers + admin only.
--     document_files           — owner of the parent worker document, or
--                                the org-document read predicate. Admin.
--     document_acknowledgements— the assignee, the assigner, org
--                                owner/admin, admin.
--     storage.objects          — read: only objects whose registered
--                                document_files row the caller may read;
--                                insert/delete: only under the canonical
--                                parent-scoped path prefix, and delete only
--                                while the object is NOT yet registered
--                                (orphan cleanup; registered files are
--                                immutable from the client).
--   service_role:   full (unchanged Supabase default).
--   Writes:         RPC-only for every new table (no insert/update/delete
--                   policy + explicit revoke).
--   Cross-org:      zero leakage — every predicate resolves through the
--                   caller's own membership/ownership rows.
--
-- ── ROLLBACK: supabase/rollbacks/20260817120000_document_file_layer_v1.down.sql
-- (reverse SQL: drop new policies/bucket/functions/tables, restore the two
-- widened constraints, delete the seeded org type slugs).
-- ============================================================================

begin;

-- ── 1. Document type registry: admit the org categories (additive) ─────────
alter table public.document_types
  drop constraint document_types_category_check;
alter table public.document_types
  add constraint document_types_category_check
  check (category in ('identity','qualification','posting','organization'));

insert into public.document_types (slug, category) values
  ('org_policy', 'organization'),
  ('org_procedure', 'organization'),
  ('org_instruction', 'organization'),
  ('org_correspondence_incoming', 'organization'),
  ('org_correspondence_outgoing', 'organization'),
  ('org_internal', 'organization'),
  ('org_agreement_attachment', 'organization')
on conflict (slug) do nothing;

-- ── 2. Org document register (NEW org-scope entity; worker scope untouched) ─
create table if not exists public.org_documents (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  document_type_slug      text not null references public.document_types(slug),
  title                   text not null check (char_length(title) between 3 and 200),
  description             text check (description is null or char_length(description) <= 2000),
  status                  text not null default 'active'
                            check (status in ('active','archived','revoked')),
  classification          text not null default 'standard'
                            check (classification in ('standard','classified')),
  responsible_profile_id  uuid references public.profiles(id),
  project_id              uuid references public.projects(id),
  worker_id               uuid references public.workers(id),
  external_ref            text check (external_ref is null or char_length(external_ref) <= 200),
  valid_from              date,
  expires_on              date,
  retention_until         date,
  retention_note          text check (retention_note is null or char_length(retention_note) <= 500),
  created_by              uuid not null references public.profiles(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists org_documents_org_idx
  on public.org_documents (organization_id, created_at desc);
create index if not exists org_documents_worker_idx
  on public.org_documents (worker_id) where worker_id is not null;

-- ── 3. Append-only org document events (mirrors worker_document_events) ────
create table if not exists public.org_document_events (
  id               uuid primary key default gen_random_uuid(),
  org_document_id  uuid not null references public.org_documents(id) on delete cascade,
  actor_id         uuid not null references public.profiles(id),
  event_type       text not null check (event_type in
                     ('created','file_uploaded','archived','revoked',
                      'ack_assigned','acknowledged','downloaded')),
  before_state     jsonb,
  after_state      jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists org_document_events_doc_idx
  on public.org_document_events (org_document_id, created_at);

-- ── 4. Document files — version rows, THE file truth for both scopes ───────
create table if not exists public.document_files (
  id                  uuid primary key default gen_random_uuid(),
  scope               text not null check (scope in ('worker','organization')),
  worker_document_id  uuid references public.worker_documents(id) on delete cascade,
  org_document_id     uuid references public.org_documents(id) on delete cascade,
  version             int not null check (version between 1 and 50),
  storage_path        text not null unique
                        check (char_length(storage_path) between 1 and 1024),
  original_filename   text not null check (char_length(original_filename) between 1 and 255),
  mime_type           text not null check (mime_type in
                        ('application/pdf','image/jpeg','image/png','image/webp',
                         'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  byte_size           bigint not null check (byte_size > 0 and byte_size <= 5242880),
  content_sha256      text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by         uuid not null references public.profiles(id),
  uploaded_at         timestamptz not null default now(),
  superseded_at       timestamptz,
  constraint document_files_exactly_one_parent check (
    (scope = 'worker'
      and worker_document_id is not null and org_document_id is null)
    or
    (scope = 'organization'
      and org_document_id is not null and worker_document_id is null)
  )
);
-- Version is unique per parent; exactly ONE current (non-superseded) version.
create unique index if not exists document_files_worker_version_idx
  on public.document_files (worker_document_id, version)
  where worker_document_id is not null;
create unique index if not exists document_files_org_version_idx
  on public.document_files (org_document_id, version)
  where org_document_id is not null;
create unique index if not exists document_files_worker_current_idx
  on public.document_files (worker_document_id)
  where worker_document_id is not null and superseded_at is null;
create unique index if not exists document_files_org_current_idx
  on public.document_files (org_document_id)
  where org_document_id is not null and superseded_at is null;

-- ── 5. Version-bound, fill-once acknowledgements ───────────────────────────
create table if not exists public.document_acknowledgements (
  id                   uuid primary key default gen_random_uuid(),
  -- Binds to the FILE VERSION: acknowledging v N never covers v N+1.
  document_file_id     uuid not null references public.document_files(id) on delete cascade,
  assignee_profile_id  uuid not null references public.profiles(id) on delete cascade,
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  required_by          date,
  acknowledged_at      timestamptz,
  acknowledged_by      uuid references public.profiles(id),
  evidence             jsonb
    constraint document_acknowledgements_evidence_bounded
    check (evidence is null or pg_column_size(evidence) <= 2048),
  assigned_by          uuid not null references public.profiles(id),
  created_at           timestamptz not null default now(),
  -- Delegation is NOT allowed: only the assignee can acknowledge.
  constraint document_acknowledgements_self_only
    check (acknowledged_by is null or acknowledged_by = assignee_profile_id),
  constraint document_acknowledgements_stamp_pair
    check ((acknowledged_at is null) = (acknowledged_by is null)),
  constraint document_acknowledgements_once
    unique (document_file_id, assignee_profile_id)
);
create index if not exists document_acknowledgements_assignee_idx
  on public.document_acknowledgements (assignee_profile_id)
  where acknowledged_at is null;
create index if not exists document_acknowledgements_org_idx
  on public.document_acknowledgements (organization_id, created_at desc);

-- ── 6. Authority helpers (SECURITY DEFINER; also used by storage policies) ─
create or replace function public.owns_worker_document_v1(p_worker_document_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.worker_documents wd
      join public.workers w on w.id = wd.worker_id
     where wd.id = p_worker_document_id
       and w.profile_id = auth.uid()
  )
$$;
revoke all on function public.owns_worker_document_v1(uuid) from public;
revoke all on function public.owns_worker_document_v1(uuid) from anon;
grant execute on function public.owns_worker_document_v1(uuid) to authenticated;

create or replace function public.org_owner_admin_v1(p_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_organization_id is not null and exists (
    select 1 from public.company_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = p_organization_id
       and m.status = 'active'
       and m.role in ('owner','admin')
  )
$$;
revoke all on function public.org_owner_admin_v1(uuid) from public;
revoke all on function public.org_owner_admin_v1(uuid) from anon;
grant execute on function public.org_owner_admin_v1(uuid) to authenticated;

create or replace function public.manages_org_document_v1(p_org_document_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin() or exists (
    select 1 from public.org_documents od
     where od.id = p_org_document_id
       and (od.responsible_profile_id = auth.uid()
            or public.org_owner_admin_v1(od.organization_id))
  )
$$;
revoke all on function public.manages_org_document_v1(uuid) from public;
revoke all on function public.manages_org_document_v1(uuid) from anon;
grant execute on function public.manages_org_document_v1(uuid) to authenticated;

create or replace function public.can_read_org_document_v1(p_org_document_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.manages_org_document_v1(p_org_document_id)
    -- Any ACTIVE member reads ACTIVE, non-classified documents.
    or exists (
      select 1
        from public.org_documents od
        join public.company_memberships m
          on m.organization_id = od.organization_id
       where od.id = p_org_document_id
         and od.status = 'active'
         and od.classification = 'standard'
         and m.profile_id = auth.uid()
         and m.status = 'active'
    )
    -- A version-bound acknowledgement assignee reads the document it names.
    or exists (
      select 1
        from public.document_acknowledgements a
        join public.document_files df on df.id = a.document_file_id
       where df.org_document_id = p_org_document_id
         and a.assignee_profile_id = auth.uid()
    )
$$;
revoke all on function public.can_read_org_document_v1(uuid) from public;
revoke all on function public.can_read_org_document_v1(uuid) from anon;
grant execute on function public.can_read_org_document_v1(uuid) to authenticated;

-- ── 7. RLS: SELECT-only for authenticated; ALL writes are RPC-only ─────────
alter table public.org_documents enable row level security;
alter table public.org_document_events enable row level security;
alter table public.document_files enable row level security;
alter table public.document_acknowledgements enable row level security;

drop policy if exists org_documents_select on public.org_documents;
create policy org_documents_select on public.org_documents
  for select to authenticated
  using (public.can_read_org_document_v1(id));

drop policy if exists org_document_events_select on public.org_document_events;
create policy org_document_events_select on public.org_document_events
  for select to authenticated
  using (public.manages_org_document_v1(org_document_id));

drop policy if exists document_files_select on public.document_files;
create policy document_files_select on public.document_files
  for select to authenticated
  using (
    (worker_document_id is not null
      and public.owns_worker_document_v1(worker_document_id))
    or (org_document_id is not null
      and public.can_read_org_document_v1(org_document_id))
    or public.is_admin()
  );

drop policy if exists document_acknowledgements_select on public.document_acknowledgements;
create policy document_acknowledgements_select on public.document_acknowledgements
  for select to authenticated
  using (
    assignee_profile_id = auth.uid()
    or assigned_by = auth.uid()
    or public.org_owner_admin_v1(organization_id)
    or public.is_admin()
  );

grant select on public.org_documents to authenticated;
grant select on public.org_document_events to authenticated;
grant select on public.document_files to authenticated;
grant select on public.document_acknowledgements to authenticated;
revoke insert, update, delete on public.org_documents from authenticated;
revoke insert, update, delete on public.org_document_events from authenticated;
revoke insert, update, delete on public.document_files from authenticated;
revoke insert, update, delete on public.document_acknowledgements from authenticated;

-- ── 8. Widen worker_document_events to record file uploads (additive) ──────
alter table public.worker_document_events
  drop constraint worker_document_events_event_type_check;
alter table public.worker_document_events
  add constraint worker_document_events_event_type_check
  check (event_type in ('created','updated','status_changed','file_uploaded'));

-- ── 9. RPCs — the ONLY write paths ─────────────────────────────────────────

-- 9.1 Create an org register entry. Org owner/admin (or platform admin).
create or replace function public.create_org_document_v1(
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
  p_responsible_profile_id text
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
  v_worker         uuid;
  v_project        uuid;
  v_responsible    uuid;
  v_from           date;
  v_expires        date;
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
  if not exists (select 1 from public.document_types dt
                  where dt.slug = p_document_type_slug
                    and dt.is_active
                    and dt.category = 'organization') then
    return 'invalid';
  end if;
  begin
    v_worker      := nullif(trim(coalesce(p_worker_id, '')), '')::uuid;
    v_project     := nullif(trim(coalesce(p_project_id, '')), '')::uuid;
    v_responsible := nullif(trim(coalesce(p_responsible_profile_id, '')), '')::uuid;
    v_from        := nullif(trim(coalesce(p_valid_from, '')), '')::date;
    v_expires     := nullif(trim(coalesce(p_expires_on, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return 'invalid';
  end;
  if v_worker is not null
     and not exists (select 1 from public.workers w where w.id = v_worker) then
    return 'invalid';
  end if;
  if v_project is not null
     and not exists (select 1 from public.projects p where p.id = v_project) then
    return 'invalid';
  end if;
  if v_responsible is not null and not exists (
       select 1 from public.company_memberships m
        where m.profile_id = v_responsible
          and m.organization_id = p_organization_id
          and m.status = 'active') then
    return 'invalid';
  end if;

  -- Abuse cap: bounded register per organization.
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
       valid_from, expires_on, created_by)
    values
      (p_organization_id, p_document_type_slug, v_title, v_description,
       v_classification, v_responsible, v_project, v_worker, v_external_ref,
       v_from, v_expires, uid)
    returning id into row_id;

  insert into public.org_document_events
      (org_document_id, actor_id, event_type, after_state)
    values (row_id, uid, 'created',
            jsonb_build_object('title', v_title,
              'document_type_slug', p_document_type_slug,
              'classification', v_classification));
  return 'created';
end $$;
revoke all on function public.create_org_document_v1(uuid, text, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.create_org_document_v1(uuid, text, text, text, text, text, text, text, text, text, text) from anon;
grant execute on function public.create_org_document_v1(uuid, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- 9.2 Archive (active → archived). Org owner/admin or platform admin.
create or replace function public.archive_org_document_v1(
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
  update public.org_documents
     set status = 'archived', updated_at = now()
   where id = doc.id;
  insert into public.org_document_events
      (org_document_id, actor_id, event_type, before_state, after_state)
    values (doc.id, uid, 'archived',
            jsonb_build_object('status', doc.status),
            jsonb_build_object('status', 'archived'));
  return 'archived';
end $$;
revoke all on function public.archive_org_document_v1(uuid) from public;
revoke all on function public.archive_org_document_v1(uuid) from anon;
grant execute on function public.archive_org_document_v1(uuid) to authenticated;

-- 9.3 Revoke (active/archived → revoked). Files are KEPT (no deletion here).
create or replace function public.revoke_org_document_v1(
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
  if doc.status = 'revoked' then
    return 'invalid_state';
  end if;
  update public.org_documents
     set status = 'revoked', updated_at = now()
   where id = doc.id;
  insert into public.org_document_events
      (org_document_id, actor_id, event_type, before_state, after_state)
    values (doc.id, uid, 'revoked',
            jsonb_build_object('status', doc.status),
            jsonb_build_object('status', 'revoked'));
  return 'revoked';
end $$;
revoke all on function public.revoke_org_document_v1(uuid) from public;
revoke all on function public.revoke_org_document_v1(uuid) from anon;
grant execute on function public.revoke_org_document_v1(uuid) to authenticated;

-- 9.4 Register an uploaded file — called by the upload server action AFTER
-- the storage write succeeded. Assigns the next version under a parent row
-- lock (monotonic, gap-free), verifies the storage path against the
-- CANONICAL prefix for exactly that version, supersedes the previous
-- current version, and records the event. A failed registration leaves an
-- ORPHAN blob which the caller must remove (storage delete policy only
-- admits unregistered objects).
create or replace function public.register_document_file_v1(
  p_scope text,
  p_parent_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_byte_size bigint,
  p_content_sha256 text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid             uuid := auth.uid();
  cleaned_path    text := nullif(trim(coalesce(p_storage_path, '')), '');
  cleaned_name    text := nullif(trim(coalesce(p_original_filename, '')), '');
  cleaned_mime    text := lower(nullif(trim(coalesce(p_mime_type, '')), ''));
  cleaned_sha     text := lower(nullif(trim(coalesce(p_content_sha256, '')), ''));
  wd              public.worker_documents%rowtype;
  od              public.org_documents%rowtype;
  v_worker_id     uuid;
  next_version    int;
  expected_prefix text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_scope not in ('worker','organization') or p_parent_id is null then
    return 'invalid';
  end if;
  if cleaned_name is null or char_length(cleaned_name) > 255 then
    return 'invalid';
  end if;
  if cleaned_mime is null or cleaned_mime not in
       ('application/pdf','image/jpeg','image/png','image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
    return 'unsupported_type';
  end if;
  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 5242880 then
    return 'file_too_large';
  end if;
  if cleaned_sha is null or cleaned_sha !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;
  if cleaned_path is null or char_length(cleaned_path) > 1024 then
    return 'invalid';
  end if;

  if p_scope = 'worker' then
    -- Lock the parent so concurrent uploads serialize on one version chain.
    select * into wd from public.worker_documents w
     where w.id = p_parent_id
     for update;
    if wd.id is null or not public.owns_worker_document_v1(wd.id) then
      return 'not_found';
    end if;
    v_worker_id := wd.worker_id;
    select coalesce(max(df.version), 0) + 1 into next_version
      from public.document_files df
     where df.worker_document_id = wd.id;
    expected_prefix := 'worker/' || v_worker_id::text || '/doc/' || wd.id::text
                       || '/v' || next_version::text || '/';
  else
    select * into od from public.org_documents o
     where o.id = p_parent_id
     for update;
    if od.id is null or not public.manages_org_document_v1(od.id) then
      return 'not_found';
    end if;
    if od.status = 'revoked' then
      return 'invalid_state';
    end if;
    select coalesce(max(df.version), 0) + 1 into next_version
      from public.document_files df
     where df.org_document_id = od.id;
    expected_prefix := 'org/' || od.organization_id::text || '/doc/' || od.id::text
                       || '/v' || next_version::text || '/';
  end if;

  if next_version > 50 then
    return 'version_limit_reached';
  end if;
  if position(expected_prefix in cleaned_path) <> 1
     or char_length(cleaned_path) <= char_length(expected_prefix) then
    return 'path_mismatch';
  end if;

  -- Supersede the previous current version — acknowledgements stay bound to
  -- their version row and deliberately do NOT carry over.
  if p_scope = 'worker' then
    update public.document_files
       set superseded_at = now()
     where worker_document_id = wd.id and superseded_at is null;
    insert into public.document_files
        (scope, worker_document_id, version, storage_path, original_filename,
         mime_type, byte_size, content_sha256, uploaded_by)
      values ('worker', wd.id, next_version, cleaned_path, cleaned_name,
              cleaned_mime, p_byte_size, cleaned_sha, uid);
    insert into public.worker_document_events
        (worker_document_id, actor_id, event_type, after_state)
      values (wd.id, uid, 'file_uploaded',
              jsonb_build_object('version', next_version,
                'original_filename', cleaned_name, 'byte_size', p_byte_size));
  else
    update public.document_files
       set superseded_at = now()
     where org_document_id = od.id and superseded_at is null;
    insert into public.document_files
        (scope, org_document_id, version, storage_path, original_filename,
         mime_type, byte_size, content_sha256, uploaded_by)
      values ('organization', od.id, next_version, cleaned_path, cleaned_name,
              cleaned_mime, p_byte_size, cleaned_sha, uid);
    insert into public.org_document_events
        (org_document_id, actor_id, event_type, after_state)
      values (od.id, uid, 'file_uploaded',
              jsonb_build_object('version', next_version,
                'original_filename', cleaned_name, 'byte_size', p_byte_size));
  end if;
  return 'registered';
end $$;
revoke all on function public.register_document_file_v1(text, uuid, text, text, text, bigint, text) from public;
revoke all on function public.register_document_file_v1(text, uuid, text, text, text, bigint, text) from anon;
grant execute on function public.register_document_file_v1(text, uuid, text, text, text, bigint, text) to authenticated;

-- 9.5 Assign a version-bound acknowledgement. Document managers only; the
-- assignee must be an active org member or the linked worker's profile.
create or replace function public.assign_document_acknowledgement_v1(
  p_document_file_id uuid,
  p_assignee_profile_id uuid,
  p_required_by text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  f          public.document_files%rowtype;
  doc        public.org_documents%rowtype;
  v_required date;
  linked_worker_profile uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_document_file_id is null or p_assignee_profile_id is null then
    return 'invalid';
  end if;
  begin
    v_required := nullif(trim(coalesce(p_required_by, '')), '')::date;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return 'invalid';
  end;

  select * into f from public.document_files df
   where df.id = p_document_file_id;
  if f.id is null or f.org_document_id is null
     or not public.manages_org_document_v1(f.org_document_id) then
    return 'not_found';
  end if;
  if f.superseded_at is not null then
    -- Only the CURRENT version can be assigned — an outdated version must
    -- not gather fresh confirmations.
    return 'not_current';
  end if;
  select * into doc from public.org_documents o where o.id = f.org_document_id;
  if doc.status <> 'active' then
    return 'invalid_state';
  end if;

  select w.profile_id into linked_worker_profile
    from public.workers w
   where doc.worker_id is not null and w.id = doc.worker_id;
  if not exists (
       select 1 from public.company_memberships m
        where m.profile_id = p_assignee_profile_id
          and m.organization_id = doc.organization_id
          and m.status = 'active')
     and (linked_worker_profile is null
          or linked_worker_profile <> p_assignee_profile_id) then
    return 'invalid_assignee';
  end if;

  begin
    insert into public.document_acknowledgements
        (document_file_id, assignee_profile_id, organization_id,
         required_by, assigned_by)
      values (f.id, p_assignee_profile_id, doc.organization_id,
              v_required, uid);
  exception when unique_violation then
    return 'already_assigned';
  end;

  insert into public.org_document_events
      (org_document_id, actor_id, event_type, after_state)
    values (doc.id, uid, 'ack_assigned',
            jsonb_build_object('document_file_id', f.id,
              'version', f.version,
              'assignee_profile_id', p_assignee_profile_id));
  return 'assigned';
end $$;
revoke all on function public.assign_document_acknowledgement_v1(uuid, uuid, text) from public;
revoke all on function public.assign_document_acknowledgement_v1(uuid, uuid, text) from anon;
grant execute on function public.assign_document_acknowledgement_v1(uuid, uuid, text) to authenticated;

-- 9.6 Acknowledge — assignee only, fill-once, server-stamped.
create or replace function public.acknowledge_document_v1(
  p_acknowledgement_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ack public.document_acknowledgements%rowtype;
  f   public.document_files%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into ack from public.document_acknowledgements a
   where a.id = p_acknowledgement_id
   for update;
  if ack.id is null or ack.assignee_profile_id <> uid then
    -- One answer, no existence leak.
    return 'not_found';
  end if;
  if ack.acknowledged_at is not null then
    return 'already_acknowledged';
  end if;
  update public.document_acknowledgements
     set acknowledged_at = now(), acknowledged_by = uid
   where id = ack.id;
  select * into f from public.document_files df where df.id = ack.document_file_id;
  if f.org_document_id is not null then
    insert into public.org_document_events
        (org_document_id, actor_id, event_type, after_state)
      values (f.org_document_id, uid, 'acknowledged',
              jsonb_build_object('acknowledgement_id', ack.id,
                'version', f.version));
  end if;
  return 'acknowledged';
end $$;
revoke all on function public.acknowledge_document_v1(uuid) from public;
revoke all on function public.acknowledge_document_v1(uuid) from anon;
grant execute on function public.acknowledge_document_v1(uuid) to authenticated;

-- 9.7 Record a download of a CLASSIFIED org document version (called by the
-- download route before minting the signed URL; readers only).
create or replace function public.record_org_document_download_v1(
  p_document_file_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  f   public.document_files%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into f from public.document_files df
   where df.id = p_document_file_id;
  if f.id is null or f.org_document_id is null
     or not public.can_read_org_document_v1(f.org_document_id) then
    return 'not_found';
  end if;
  insert into public.org_document_events
      (org_document_id, actor_id, event_type, after_state)
    values (f.org_document_id, uid, 'downloaded',
            jsonb_build_object('document_file_id', f.id, 'version', f.version));
  return 'recorded';
end $$;
revoke all on function public.record_org_document_download_v1(uuid) from public;
revoke all on function public.record_org_document_download_v1(uuid) from anon;
grant execute on function public.record_org_document_download_v1(uuid) to authenticated;

-- ── 10. Private storage bucket + object policies ───────────────────────────
-- Path contract (pinned by register_document_file_v1 AND these policies):
--   worker/<worker_id>/doc/<worker_document_id>/v<version>/<filename>
--   org/<organization_id>/doc/<org_document_id>/v<version>/<filename>
insert into storage.buckets (id, name, public)
values ('document-files', 'document-files', false)
on conflict (id) do nothing;

do $$
begin
  begin
    update storage.buckets
       set file_size_limit = 5242880,
           allowed_mime_types = array[
             'application/pdf',
             'image/jpeg',
             'image/png',
             'image/webp',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
           ]
     where id = 'document-files';
  exception when undefined_column then
    -- Storage extension lacks these columns; the RPC + policies still cap.
    null;
  end;
end $$;

-- Read: objects whose REGISTERED document_files row the caller may read —
-- the table RLS truth decides, never the path alone. One extra branch:
-- an UNREGISTERED object under the caller's own upload prefix stays
-- visible to that uploader — required so the orphan-cleanup DELETE (whose
-- WHERE reads the row and therefore passes through SELECT policies) can
-- find the blob it just wrote; proven by scripts/db-proof/
-- document-file-layer.sh ("unregistered orphan IS deletable").
drop policy if exists "document-files entity read"
  on storage.objects;
create policy "document-files entity read"
  on storage.objects for select
  using (
    bucket_id = 'document-files'
    and auth.uid() is not null
    and (
      exists (
        select 1 from public.document_files df
         where df.storage_path = storage.objects.name
           and (
             (df.worker_document_id is not null
               and public.owns_worker_document_v1(df.worker_document_id))
             or (df.org_document_id is not null
               and public.can_read_org_document_v1(df.org_document_id))
           )
      )
      or (
        not exists (
          select 1 from public.document_files df
           where df.storage_path = storage.objects.name
        )
        and (
          (
            (storage.foldername(name))[1] = 'worker'
            and (storage.foldername(name))[3] = 'doc'
            and exists (
              select 1
                from public.worker_documents wd
                join public.workers w on w.id = wd.worker_id
               where wd.id::text = (storage.foldername(name))[4]
                 and w.id::text = (storage.foldername(name))[2]
                 and w.profile_id = auth.uid()
            )
          )
          or (
            (storage.foldername(name))[1] = 'org'
            and (storage.foldername(name))[3] = 'doc'
            and exists (
              select 1 from public.org_documents od
               where od.id::text = (storage.foldername(name))[4]
                 and od.organization_id::text = (storage.foldername(name))[2]
                 and public.manages_org_document_v1(od.id)
            )
          )
        )
      )
    )
  );

drop policy if exists "document-files admin read"
  on storage.objects;
create policy "document-files admin read"
  on storage.objects for select
  using (
    bucket_id = 'document-files'
    and public.is_admin()
  );

-- Insert: only under the canonical prefix of a parent row the caller may
-- attach files to (registration + version are then enforced by the RPC).
drop policy if exists "document-files scoped insert"
  on storage.objects;
create policy "document-files scoped insert"
  on storage.objects for insert
  with check (
    bucket_id = 'document-files'
    and auth.uid() is not null
    and (
      (
        (storage.foldername(name))[1] = 'worker'
        and (storage.foldername(name))[3] = 'doc'
        and exists (
          select 1
            from public.worker_documents wd
            join public.workers w on w.id = wd.worker_id
           where wd.id::text = (storage.foldername(name))[4]
             and w.id::text = (storage.foldername(name))[2]
             and w.profile_id = auth.uid()
        )
      )
      or (
        (storage.foldername(name))[1] = 'org'
        and (storage.foldername(name))[3] = 'doc'
        and exists (
          select 1 from public.org_documents od
           where od.id::text = (storage.foldername(name))[4]
             and od.organization_id::text = (storage.foldername(name))[2]
             and public.manages_org_document_v1(od.id)
        )
      )
    )
  );

-- Delete: ORPHAN CLEANUP ONLY — same scope as insert, and never an object
-- that is registered in document_files (registered versions are immutable
-- from the client; hard delete stays owner-gated).
drop policy if exists "document-files orphan delete"
  on storage.objects;
create policy "document-files orphan delete"
  on storage.objects for delete
  using (
    bucket_id = 'document-files'
    and auth.uid() is not null
    and not exists (
      select 1 from public.document_files df
       where df.storage_path = storage.objects.name
    )
    and (
      (
        (storage.foldername(name))[1] = 'worker'
        and (storage.foldername(name))[3] = 'doc'
        and exists (
          select 1
            from public.worker_documents wd
            join public.workers w on w.id = wd.worker_id
           where wd.id::text = (storage.foldername(name))[4]
             and w.id::text = (storage.foldername(name))[2]
             and w.profile_id = auth.uid()
        )
      )
      or (
        (storage.foldername(name))[1] = 'org'
        and (storage.foldername(name))[3] = 'doc'
        and exists (
          select 1 from public.org_documents od
           where od.id::text = (storage.foldername(name))[4]
             and od.organization_id::text = (storage.foldername(name))[2]
             and public.manages_org_document_v1(od.id)
        )
      )
    )
  );

commit;

-- ROLLBACK (reverse SQL — see the paired down file):
-- drop the four storage policies; delete bucket rows; drop the seven RPCs;
-- drop document_acknowledgements, document_files, org_document_events,
-- org_documents; drop the four helper functions; restore the
-- worker_document_events and document_types check constraints; delete the
-- seeded 'organization'-category document_types slugs.
