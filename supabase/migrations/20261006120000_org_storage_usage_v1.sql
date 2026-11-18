-- @human-gate-approved
--
-- ── SCOPE OF THE HUMAN GATE ────────────────────────────────────────────────
-- SAFETY CLASS: RED by classifier (two SECURITY DEFINER functions + GRANT/
-- REVOKE), READ-ONLY by content. NO OWNER APPROVAL EXISTS FOR THIS FILE YET:
-- the marker above is the risk acknowledgement the static gate reads, not an
-- approval. Apply ONLY via Supabase MCP `apply_migration` after explicit owner
-- approval. Never `supabase db push`.
--
-- 20261006120000 — organization storage usage (fair-use cap, 2 GiB default).
--
-- WHAT THIS ADDS (additive, read-only, no table/column/policy touched):
--   1. org_storage_usage_v1_authorized(uuid)  — NOT created; the check is
--      inlined below so no third function and no extra grant surface exists.
--   1. public.org_storage_used_bytes_v1(p_organization_id uuid) returns bigint
--      Sum of the bytes the schema can PROVE belong to the organization:
--        a. document_files (scope = 'organization') via org_documents,
--           every version row (superseded versions are still stored);
--        b. journal_entry_photos (upload_status = 'uploaded') via
--           journal_entries.engagement_context_id ->
--           engagement_contexts.organization_id. A context with NULL
--           organization is personal and is never attributed to an org.
--      Caller must be an admin, an active company member of the org, or hold
--      an active engagement context in it; otherwise 42501.
--   2. public.org_storage_journal_entry_org_v1(p_entry_id uuid) returns uuid
--      The organization a journal entry's photo counts against, only for the
--      entry's OWN worker (workers.profile_id = auth.uid()); NULL when the
--      entry is personal, not the caller's, or does not exist (one answer for
--      all three — nothing is disclosed about other people's entries).
--
-- NOT COVERED (no provable organization relation; see lib/storage/
-- org-storage-quota.ts SCHEMA GAP): customer-request attachments,
-- conversation attachments, profile avatars, worker-scope documents.
--
-- ENFORCEMENT NOTE: documents upload via a server action (hard gate).
-- Journal photos upload browser-direct, so the web client pre-checks with
-- these functions. A tamper-proof gate would additionally require
-- register_journal_entry_photo to call org_storage_used_bytes_v1; that is a
-- CREATE OR REPLACE of an existing function and is intentionally left to a
-- separate, reviewed migration.
--
-- Locking: none (STABLE, plain SELECTs, no FOR UPDATE). Idempotent: CREATE OR
-- REPLACE with identical signatures; REVOKE/GRANT are repeatable. Both
-- functions are new names, so nothing existing is replaced.
--
-- ROLLBACK (run manually only if reverting; the web code degrades to a
-- documents-only total / fail-open when these are absent):
--   -- drop function if exists public.org_storage_journal_entry_org_v1(uuid);
--   -- drop function if exists public.org_storage_used_bytes_v1(uuid);
-- Paired file: supabase/rollbacks/20261006120000_org_storage_usage_v1.down.sql

begin;

create or replace function public.org_storage_used_bytes_v1(p_organization_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_docs bigint;
  v_pics bigint;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;

  if not (
    public.is_admin()
    or exists (
      select 1 from public.company_memberships m
       where m.profile_id = v_uid
         and m.organization_id = p_organization_id
         and m.status = 'active'
    )
    or exists (
      select 1 from public.engagement_contexts ec
       where ec.profile_id = v_uid
         and ec.organization_id = p_organization_id
         and ec.status = 'active'
    )
  ) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  select coalesce(sum(df.byte_size), 0)::bigint into v_docs
    from public.document_files df
    join public.org_documents od on od.id = df.org_document_id
   where df.scope = 'organization'
     and od.organization_id = p_organization_id;

  select coalesce(sum(p.file_size_bytes), 0)::bigint into v_pics
    from public.journal_entry_photos p
    join public.journal_entries je on je.id = p.entry_id
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
   where ec.organization_id = p_organization_id
     and p.upload_status = 'uploaded';

  return v_docs + v_pics;
end
$fn$;

revoke all on function public.org_storage_used_bytes_v1(uuid) from public;
revoke all on function public.org_storage_used_bytes_v1(uuid) from anon;
grant execute on function public.org_storage_used_bytes_v1(uuid) to authenticated;

create or replace function public.org_storage_journal_entry_org_v1(p_entry_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select ec.organization_id
    from public.journal_entries je
    join public.workers w on w.id = je.worker_id
    join public.engagement_contexts ec on ec.id = je.engagement_context_id
   where je.id = p_entry_id
     and auth.uid() is not null
     and w.profile_id = auth.uid()
$fn$;

revoke all on function public.org_storage_journal_entry_org_v1(uuid) from public;
revoke all on function public.org_storage_journal_entry_org_v1(uuid) from anon;
grant execute on function public.org_storage_journal_entry_org_v1(uuid) to authenticated;

commit;
