-- DOWN for 20260930160000_historical_timesheet_m3_source_preservation
-- Historical timesheet import PR-4 (design §9.3 "ROLLBACK", §14 row M3).
--
-- REFUSES while any org_import_source document exists, or while any
-- document_files row carries a CSV / XLSX type: a preserved timesheet source
-- is provenance, and restoring the narrower CHECK would fail on those rows.
-- When both counts are 0 it, in reverse order:
--   • restores public.register_document_file_v1 BYTE-FOR-BYTE to the body
--     production held before M3 (pg_get_functiondef read 2026-09-24,
--     md5(prosrc) 23ee05137f9e6529fdf989cdbf2ca717 — the five-type MIME list;
--     apps/web/lib/guards/historical-timesheet-m2-m3-migration.test.ts pins
--     that md5 on this file), SECURITY DEFINER and search_path kept, privileges
--     re-asserted unchanged;
--   • restores document_files_mime_type_check to the five-type list under the
--     same name, and the bucket 'document-files'.allowed_mime_types array;
--   • drops document_files_sha256_idx;
--   • deletes the unused document_types row org_import_source.
--
-- Apply via Supabase MCP apply_migration, never db push.

begin;

do $hist_m_three_down_guard$
declare
  v_n bigint;
begin
  select count(*) into v_n from public.org_documents
   where document_type_slug = 'org_import_source';
  if v_n > 0 then
    raise exception 'REFUSED: % org_documents row(s) of type org_import_source — a preserved timesheet source is provenance and is never dropped', v_n;
  end if;

  select count(*) into v_n from public.document_files
   where mime_type in ('text/csv',
                       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if v_n > 0 then
    raise exception 'REFUSED: % document_files row(s) carry a CSV / XLSX type — the five-type CHECK cannot be restored over them', v_n;
  end if;
end $hist_m_three_down_guard$;

-- ── M3e ── the production body, byte-for-byte (five-type list) ─────────────
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
revoke all on function public.register_document_file_v1(text, uuid, text, text, text, bigint, text) from public;
revoke all on function public.register_document_file_v1(text, uuid, text, text, text, bigint, text) from anon;
grant execute on function public.register_document_file_v1(text, uuid, text, text, text, bigint, text) to authenticated;

-- ── M3d ── the hash index ───────────────────────────────────────────────────
drop index if exists public.document_files_sha256_idx;

-- ── M3c ── the bucket: the five-type list ───────────────────────────────────
update storage.buckets set allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
 where id = 'document-files';

-- ── M3b ── the CHECK: the five-type list under the original name ────────────
alter table public.document_files drop constraint if exists document_files_mime_type_check;
alter table public.document_files add constraint document_files_mime_type_check check (mime_type in (
  'application/pdf','image/jpeg','image/png','image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));

-- ── M3a ── the unused slug (guarded above: 0 documents of this type) ────────
delete from public.document_types where slug = 'org_import_source';

commit;
