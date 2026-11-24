-- ROLLBACK for 20261007180000_evidence_media_bucket_v1.sql
-- Guarded: refuses while the bucket holds any object (the bytes are the only
-- copy of the photos). Apply via Supabase MCP `apply_migration` only.

do $rb$
begin
  if exists (select 1 from storage.objects where bucket_id = 'evidence-media') then
    raise exception 'evidence-media holds objects; refusing to drop (export first)'
      using errcode = '55000';
  end if;
end
$rb$;

drop policy if exists "evidence-media orphan delete" on storage.objects;
drop policy if exists "evidence-media scoped insert" on storage.objects;
drop policy if exists "evidence-media entity read" on storage.objects;
drop trigger if exists organization_evidence_media_path_pin on public.organization_evidence_media;
drop function if exists public.organization_evidence_media_path_pin_v1();
delete from storage.buckets where id = 'evidence-media';
