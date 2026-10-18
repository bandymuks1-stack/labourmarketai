-- ROLLED-BACK PRODUCTION DRY RUN of the M3 source-preservation migration
-- (supabase/migrations/20260930160000_historical_timesheet_m3_source_preservation.sql).
-- Executed read-write inside ONE transaction that always aborts: the M3 body below is
-- byte-for-byte the migration's body, followed by a block that reports the resulting
-- function hash, definer flag, search_path, ACL and bucket facts and then RAISES, so
-- nothing is ever committed. Expected message:
--   DRYRUN_OK body_md5=e4954bc052bffb031d511d5c599649f6 secdef=true config={search_path=public}
--   acl=authenticated:EXECUTE,postgres:EXECUTE bucket_size=5242880 bucket_public=false
-- Production before: register_document_file_v1 md5(prosrc)=23ee05137f9e6529fdf989cdbf2ca717.
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
do $dry$
declare r text;
begin
  select 'DRYRUN_OK body_md5=' || md5(prosrc) || ' secdef=' || prosecdef || ' config=' || coalesce(proconfig::text,'') ||
         ' acl=' || (select string_agg(grantee||':'||privilege_type,',' order by grantee) from information_schema.routine_privileges where routine_name='register_document_file_v1' and routine_schema='public') ||
         ' bucket_size=' || (select file_size_limit from storage.buckets where id='document-files') ||
         ' bucket_public=' || (select public from storage.buckets where id='document-files')
    into r from pg_proc where proname='register_document_file_v1' and pronamespace='public'::regnamespace;
  raise exception '%', r;
end $dry$;
rollback;
