-- ============================================================================
-- 20260924120000_historical_timesheet_m3_source_preservation
-- Historical timesheet import PR-4 = migration M3 of
-- docs/design/historical-timesheet-import-v3.md: §9.3 (schema for source
-- preservation), §14 row M3 and §15 row PR-4. Owner rule F (§1): preserve the
-- source and authorise the import — the original timesheet file is kept
-- through the EXISTING document engine, and P5 (M1, applied) admits the
-- source_preserved marker only when an ACTIVE, CLASSIFIED org_import_source
-- document holds the session's bytes.
--
-- CLASS: RED under .github/scripts/migration-safety.mjs — exactly why:
--   • CREATE OR REPLACE of an EXISTING SECURITY DEFINER function,
--     public.register_document_file_v1(text,uuid,text,text,text,bigint,text).
--     It hard-codes its own MIME list and returns 'unsupported_type' for CSV
--     and XLSX, so widening only the CHECK and the bucket would leave every
--     timesheet unpreservable (design §9.3, review finding HIGH #1). The body
--     is reproduced from PRODUCTION (pg_get_functiondef read 2026-09-24,
--     md5(prosrc) 23ee05137f9e6529fdf989cdbf2ca717, 4,287 bytes) with ONLY
--     the MIME list widened; production's stored body is the repo body of
--     20260817140000_document_file_layer_v1.sql minus its two comment lines,
--     so the PRODUCTION body is the one reproduced here and restored by the
--     rollback. SECURITY DEFINER and SET search_path = public are kept.
--     Flagged as `security-definer-function`.
--   • UPDATE of the ONE storage.buckets row 'document-files' (allowed_mime_types
--     gains the two types; file_size_limit and public are untouched). The
--     bucket refuses CSV and XLSX at the storage layer, and only an UPDATE of
--     that row changes it. Flagged as `data-dml`.
--   • REVOKE / GRANT on the function, re-asserted UNCHANGED for determinism
--     (CREATE OR REPLACE keeps privileges; production ACL is
--     authenticated=EXECUTE only). Flagged as `grant-or-revoke`.
--   • the seed INSERT of the document type slug is additive (on conflict do
--     nothing) and the CHECK widening is the drop + re-add idiom with the
--     FULL old list plus the two new values — both GREEN by shape.
--   • the human gate is the control: this PR is a DRAFT with the label
--     needs-human-gate; the owner approves the exact SQL, the definer body
--     diff and the RLS/grant list in the PR body, and the lead applies it
--     through Supabase MCP apply_migration (never db push).
-- @human-gate-approved: TIER owner-gated — findings acknowledged:
--   security-definer-function (CREATE OR REPLACE of the existing definer
--   register_document_file_v1, body byte-identical to production except the
--   MIME list), grant-or-revoke (privileges re-asserted unchanged), data-dml
--   (the one-row storage.buckets UPDATE; the definer body's own supersede
--   UPDATE is unchanged from production). The annotation lets the static gate
--   pass CI; it is an acknowledgement, not an approval — the owner approves in
--   the PR (design §15 row PR-4).
--
-- WHAT IT DOES (design §9.3, in order):
--   M3a  document_types gains the slug org_import_source (category
--        organization) — the ONE type slug for a preserved timesheet source.
--   M3b  document_files.mime_type CHECK widened: the five existing types plus
--        application/vnd.openxmlformats-officedocument.spreadsheetml.sheet and
--        text/csv (same constraint name; runs only while text/csv is absent).
--   M3c  storage.buckets 'document-files'.allowed_mime_types: the same list.
--   M3d  index document_files_sha256_idx (content_sha256) — P5 joins sessions
--        to files on the hash.
--   M3e  register_document_file_v1: the production body with ONLY the MIME
--        list widened; privileges re-asserted unchanged.
--   M3f  a post-apply assertion block: the slug row, the CHECK, the bucket and
--        the function definition all carry both new types, or the transaction
--        aborts.
--   • idempotent: a re-run is a no-op (on conflict, guarded CHECK widening,
--     an UPDATE to the same value, IF NOT EXISTS, CREATE OR REPLACE).
--   • the database admits CSV and XLSX for ANY document type, because the body
--     must stay byte-identical and cannot branch on the type; the app admits
--     them only for org_import_source (design §9.2, residual §19).
--
-- DEPENDS ON: M1 (20260924100000, ledger 20260924021637, APPLIED) for P5 and
-- evidence_import_sessions.source_bytes_sha256.
--
-- CHECKS (all read-only on production 2026-09-24, results in the PR body):
--   1. md5(prosrc) of the live register_document_file_v1 = 23ee05137f9e6529fdf989cdbf2ca717
--      (the body this file and its rollback reproduce). The dry run ASSERTS it
--      before applying (PREMERGE_CHECK_M3_BODY_FAILED otherwise).
--   2. 0 org_documents of type org_import_source; 0 document_types rows with
--      that slug; 0 document_files rows of a CSV / XLSX type (0 rows in all).
--   3. the live bucket row: public false, 5 MB, the five-type list; the live
--      CHECK document_files_mime_type_check: the same five-type list.
--   4. the rolled-back DO block docs/design/historical-timesheet-m2-m3-dryrun.sql
--      (it embeds the M3 body below byte-for-byte) — executed by the lead.
--
-- ROLLBACK: supabase/rollbacks/20260924120000_historical_timesheet_m3_source_preservation.down.sql
-- REFUSES while any org_import_source document or any CSV / XLSX document_files
-- row exists; otherwise restores the function body byte-for-byte to production
-- (the five-type list), restores the CHECK and the bucket array, drops the
-- index and deletes the unused slug.
-- ============================================================================

begin;

-- M3 BODY BEGIN
-- ── M3a ── the ONE type slug for a preserved timesheet source ──────────────
insert into public.document_types (slug, category) values ('org_import_source','organization')
  on conflict (slug) do nothing;

-- ── M3b ── document_files.mime_type CHECK: the FULL old list + xlsx + csv ──
-- Drop + re-add under the SAME name (the CREATE TABLE auto-name), the idiom
-- the gate classifies GREEN. Runs only while text/csv is absent from the live
-- definition, so a re-run is a no-op.
do $hist_m_three_chk$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.document_files'::regclass
                    and conname = 'document_files_mime_type_check'
                    and pg_get_constraintdef(oid) like '%text/csv%') then
    alter table public.document_files drop constraint if exists document_files_mime_type_check;
    alter table public.document_files add constraint document_files_mime_type_check check (mime_type in (
      'application/pdf','image/jpeg','image/png','image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv')) not valid;
    alter table public.document_files validate constraint document_files_mime_type_check;
  end if;
end $hist_m_three_chk$;

-- ── M3c ── the bucket admits the same list (ONE row; size limit untouched) ──
update storage.buckets set allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv']
 where id = 'document-files';

-- ── M3d ── P5 joins sessions to files on the hash ──────────────────────────
create index if not exists document_files_sha256_idx on public.document_files (content_sha256);

-- ── M3e ── the ONE existing definer body that changes: only the MIME list ──
-- Body reproduced from PRODUCTION (md5 23ee05137f9e6529fdf989cdbf2ca717 before
-- this change); the widened list is the only difference. The rollback
-- restores that exact body.
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
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv') then
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
-- Privileges re-asserted unchanged (CREATE OR REPLACE keeps them; restated for determinism).
revoke all on function public.register_document_file_v1(text, uuid, text, text, text, bigint, text) from public;
revoke all on function public.register_document_file_v1(text, uuid, text, text, text, bigint, text) from anon;
grant execute on function public.register_document_file_v1(text, uuid, text, text, text, bigint, text) to authenticated;

-- ── M3f ── post-apply assertions: every M3 object carries both new types ───
do $hist_m_three_verify$
begin
  if not exists (select 1 from public.document_types
                  where slug = 'org_import_source' and category = 'organization' and is_active) then
    raise exception 'M3_POST_APPLY_FAILED: document_types lacks an active organization slug org_import_source';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.document_files'::regclass
                    and conname = 'document_files_mime_type_check'
                    and pg_get_constraintdef(oid) like '%text/csv%'
                    and pg_get_constraintdef(oid) like '%spreadsheetml.sheet%') then
    raise exception 'M3_POST_APPLY_FAILED: document_files_mime_type_check lacks text/csv or the xlsx type';
  end if;
  if not exists (select 1 from storage.buckets
                  where id = 'document-files'
                    and allowed_mime_types @> array['text/csv',
                          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) then
    raise exception 'M3_POST_APPLY_FAILED: bucket document-files lacks text/csv or the xlsx type';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'register_document_file_v1'
                    and p.prosecdef
                    and p.prosrc like '%''text/csv''%'
                    and p.prosrc like '%spreadsheetml.sheet%') then
    raise exception 'M3_POST_APPLY_FAILED: register_document_file_v1 body lacks text/csv or the xlsx type';
  end if;
end $hist_m_three_verify$;
-- M3 BODY END

commit;

-- ROLLBACK (down): supabase/rollbacks/20260924120000_historical_timesheet_m3_source_preservation.down.sql
-- Refuses while any org_import_source document or CSV / XLSX file row exists;
-- otherwise restores the production function body (md5 23ee05137f9e6529fdf989cdbf2ca717),
-- the five-type CHECK and bucket list, drops the index and deletes the slug.
