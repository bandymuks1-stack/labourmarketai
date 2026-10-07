-- ============================================================================
-- 20261007100000_evidence_record_media_link_v1.sql
--
-- SAFETY CLASS: RED (new table + explicit GRANT/REVOKE + RLS policies).
-- Draft PR + `needs-human-gate`. NOT applied. Apply ONLY after explicit owner
-- approval, ONLY via Supabase MCP `apply_migration` - NEVER `supabase db push`.
-- See docs/human-gates/evidence-media-link-v1-gate.md.
--
-- THE GAP THIS CLOSES (owner-confirmed, kept explicit)
--   Historical work photos have NO relationship to organization_evidence_records
--   or to projects / work objects. Today a photo exists only as
--   journal_entry_photos(entry_id -> journal_entries), and a project gallery
--   shows the photos of journal entries that were auto-linked to a project.
--   The evidence tables carry work_object_id / context_label /
--   organization_person_id but no media relationship at all.
--
-- WHAT THIS ADDS (one table, additive, no existing object is altered)
--   public.organization_evidence_media - one row per imported photo FILE the
--   organization supplied, carrying:
--     * provenance: source_system, source_reference, original_filename,
--       original_taken_at (+ taken_at_basis, so "unknown" stays "unknown"),
--       imported_by_profile_id, imported_at;
--     * ANCHORS, each nullable, at least one required (CHECK): the evidence
--       record, the work object (= project place), the organization person;
--       `organization_level` is the explicit fourth anchor for a photo that
--       belongs to the organization itself and to no record/place/person;
--     * idempotency: UNIQUE (organization_id, content_sha256) - re-importing
--       the same bytes can never create a second media row;
--     * visibility: 'private' (default) or 'subject'. Private stays private.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   * No date-proximity guess. A photo is attached to a record / object /
--     person ONLY when the importer states that relationship; original_taken_at
--     is kept as the source gave it and is never overwritten.
--   * No payment, counterparty or owner-confirmation gate: organization-
--     provided history needs none (it is reported, not verified - the media row
--     has no verification state at all).
--   * No UPDATE, no DELETE policy and no such grant: like the evidence records
--     it points at, a media row is permanent; corrections are new rows.
--   * No storage bucket and NO storage.objects policy. This table holds
--     metadata and the object location; provisioning the private bucket and its
--     read policy is a separate, separately-gated migration (it is the part
--     that decides who may download bytes). Until then rows are readable,
--     bytes are not served.
--   * No journal_entry_photos change. Existing journal photos are untouched.
--
-- WHY A NEW TABLE AND NOT document_files / org_documents
--   document_files is the version layer of the worker/org DOCUMENT REGISTER
--   (document_type_slug, title, a worker_document or org_document parent,
--   exactly-one-parent CHECK, one-current-version index, 5 MB cap, version
--   numbers). Imported historical photos are not register documents and have
--   no version chain; widening that CHECK would alter an applied table that the
--   document flows depend on. journal_entry_photos is bound to a journal entry
--   (entry_id NOT NULL) and gated by a free-tier cap. Neither is a generic
--   media layer, so there was nothing to extend. The sha256 + storage_path +
--   mime/size shape mirrors document_files, and the manages_organization /
--   is_evidence_record_subject helpers already in production decide admission.
--
-- RLS (mirrors organization_evidence_records)
--   SELECT  manages_organization(organization_id)
--           OR the SUBJECT, once their roster record is `linked`, and ONLY for
--              visibility = 'subject' (is_evidence_record_subject / the
--              organization_people linked_profile_id predicate - both RLS-safe);
--           OR is_admin().
--   INSERT  manages_organization(organization_id) AND imported_by_profile_id =
--           auth.uid() AND a referenced work object is visible to the caller.
--   No anon, no PUBLIC, no USING (true), no UPDATE/DELETE.
--
-- Reversible: trailing ROLLBACK block and
-- supabase/rollbacks/20261007100000_evidence_record_media_link_v1.down.sql
-- (guarded - refuses while any media row exists).
-- ============================================================================

create table if not exists public.organization_evidence_media (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id),

  -- ANCHORS. Each is a real, stated relationship - never inferred.
  evidence_record_id      uuid,
  work_object_id          uuid references public.work_objects(id),
  organization_person_id  uuid,
  organization_level      boolean not null default false,

  -- THE FILE. Bytes live in private storage; this row is metadata only.
  storage_bucket          text not null default 'evidence-media'
                            check (char_length(storage_bucket) between 1 and 100),
  storage_path            text not null unique
                            check (char_length(storage_path) between 1 and 1024),
  mime_type               text not null check (mime_type in
                            ('image/jpeg','image/png','image/webp','image/heic')),
  byte_size               bigint not null check (byte_size > 0 and byte_size <= 20971520),
  content_sha256          text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  caption                 text check (caption is null or char_length(caption) <= 1000),

  -- PROVENANCE. The photo keeps its original date and origin.
  source_system           text not null check (char_length(btrim(source_system)) between 1 and 80),
  source_reference        text check (source_reference is null or char_length(source_reference) <= 500),
  original_filename       text check (original_filename is null or char_length(original_filename) between 1 and 300),
  original_taken_at       timestamptz,
  -- WHERE original_taken_at came from. 'unknown' (with a null date) is a valid,
  -- honest state; a guessed date is not representable here.
  taken_at_basis          text not null default 'unknown'
                            check (taken_at_basis in ('exif','source_metadata','organization_stated','unknown')),
  imported_by_profile_id  uuid not null default auth.uid() references public.profiles(id),
  imported_at             timestamptz not null default now(),

  -- VISIBILITY. 'private' = the supplying organization (and admin) only.
  visibility              text not null default 'private'
                            check (visibility in ('private','subject')),

  constraint organization_evidence_media_has_anchor check (
    evidence_record_id is not null
    or work_object_id is not null
    or organization_person_id is not null
    or organization_level
  ),
  constraint organization_evidence_media_date_basis check (
    (original_taken_at is null) = (taken_at_basis = 'unknown')
  ),
  -- Tenancy: the record and the person must belong to the SAME organization.
  constraint organization_evidence_media_record_fk
    foreign key (evidence_record_id, organization_id)
    references public.organization_evidence_records (id, organization_id),
  constraint organization_evidence_media_person_fk
    foreign key (organization_person_id, organization_id)
    references public.organization_people (id, organization_id),
  -- IDEMPOTENCY: the same bytes are one media row per organization.
  constraint organization_evidence_media_once unique (organization_id, content_sha256)
);

create index if not exists organization_evidence_media_org_idx
  on public.organization_evidence_media (organization_id, original_taken_at desc);
create index if not exists organization_evidence_media_record_idx
  on public.organization_evidence_media (evidence_record_id) where evidence_record_id is not null;
create index if not exists organization_evidence_media_object_idx
  on public.organization_evidence_media (work_object_id) where work_object_id is not null;
create index if not exists organization_evidence_media_person_idx
  on public.organization_evidence_media (organization_person_id) where organization_person_id is not null;
create index if not exists organization_evidence_media_source_idx
  on public.organization_evidence_media (organization_id, original_filename, original_taken_at)
  where original_filename is not null;

comment on table public.organization_evidence_media is
  'A photo an organization supplied as part of its own history, anchored to a stated evidence record, work object (project place), organization person and/or the organization itself. Metadata only - bytes live in private storage. Provenance and the original taken-at date are kept as the source gave them; no relationship is ever inferred from date proximity. Reported, not verified: there is no verification state. Append-only: no UPDATE or DELETE policy or grant. visibility defaults to private.';

-- Privileges: the minimum. RLS decides rows; this decides which verbs exist.
revoke all on public.organization_evidence_media from public;
revoke all on public.organization_evidence_media from anon;
grant select, insert on public.organization_evidence_media to authenticated;

alter table public.organization_evidence_media enable row level security;

create policy organization_evidence_media_select on public.organization_evidence_media
  for select to authenticated
  using (
    public.manages_organization(organization_id)
    or (
      visibility = 'subject'
      and (
        (evidence_record_id is not null and public.is_evidence_record_subject(evidence_record_id))
        or exists (
          select 1 from public.organization_people op
           where op.id = organization_evidence_media.organization_person_id
             and op.linked_profile_id = auth.uid()
             and op.link_state = 'linked'
        )
      )
    )
    or public.is_admin()
  );

create policy organization_evidence_media_insert on public.organization_evidence_media
  for insert to authenticated
  with check (
    public.manages_organization(organization_id)
    and imported_by_profile_id = auth.uid()
    and (
      work_object_id is null
      or exists (select 1 from public.work_objects wo where wo.id = organization_evidence_media.work_object_id)
    )
  );

-- ROLLBACK (also shipped as supabase/rollbacks/20261007100000_evidence_record_media_link_v1.down.sql)
--   do $rb$ begin
--     if exists (select 1 from public.organization_evidence_media) then
--       raise exception 'organization_evidence_media holds rows; refusing to drop';
--     end if;
--   end $rb$;
--   drop policy if exists organization_evidence_media_insert on public.organization_evidence_media;
--   drop policy if exists organization_evidence_media_select on public.organization_evidence_media;
--   drop table if exists public.organization_evidence_media;
