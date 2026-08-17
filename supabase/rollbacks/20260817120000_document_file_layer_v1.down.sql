-- Rollback for 20260817120000_document_file_layer_v1.sql
--
-- Restores the prior state: the up-migration created four new tables, four
-- helper functions, seven RPCs, one private bucket with four storage
-- policies, seeded seven 'organization'-category document_types rows, and
-- WIDENED two existing check constraints. Nothing else was touched, so the
-- reverse is a plain drop + constraint restore. Dropping the tables removes
-- only feature-created rows (files/acks/events live exclusively in the new
-- tables); the app on main degrades honestly the moment they are gone
-- (42P01/42883 → needs-migration / honest no-upload note).
--
-- NOTE on the constraint restores: safe only while no rows use the widened
-- values. The guarded deletes below remove feature-created rows first
-- ('file_uploaded' worker events are only ever written by
-- register_document_file_v1, which is dropped here).

begin;

-- Storage policies + bucket (objects first, then the bucket row).
drop policy if exists "document-files entity read" on storage.objects;
drop policy if exists "document-files admin read" on storage.objects;
drop policy if exists "document-files scoped insert" on storage.objects;
drop policy if exists "document-files orphan delete" on storage.objects;
delete from storage.objects where bucket_id = 'document-files';
delete from storage.buckets where id = 'document-files';

-- RPCs.
drop function if exists public.record_org_document_download_v1(uuid);
drop function if exists public.acknowledge_document_v1(uuid);
drop function if exists public.assign_document_acknowledgement_v1(uuid, uuid, text);
drop function if exists public.register_document_file_v1(text, uuid, text, text, text, bigint, text);
drop function if exists public.revoke_org_document_v1(uuid);
drop function if exists public.archive_org_document_v1(uuid);
drop function if exists public.create_org_document_v1(uuid, text, text, text, text, text, text, text, text, text, text);

-- Tables (dependency order).
drop table if exists public.document_acknowledgements;
drop table if exists public.document_files;
drop table if exists public.org_document_events;
drop table if exists public.org_documents;

-- Helper functions (after the policies/tables that referenced them).
drop function if exists public.can_read_org_document_v1(uuid);
drop function if exists public.manages_org_document_v1(uuid);
drop function if exists public.org_owner_admin_v1(uuid);
drop function if exists public.owns_worker_document_v1(uuid);

-- Restore worker_document_events constraint (feature rows removed first).
delete from public.worker_document_events where event_type = 'file_uploaded';
alter table public.worker_document_events
  drop constraint worker_document_events_event_type_check;
alter table public.worker_document_events
  add constraint worker_document_events_event_type_check
  check (event_type in ('created','updated','status_changed'));

-- Remove the seeded org type slugs (org_documents referencing them are
-- already dropped) and restore the category constraint.
delete from public.document_types where category = 'organization';
alter table public.document_types
  drop constraint document_types_category_check;
alter table public.document_types
  add constraint document_types_category_check
  check (category in ('identity','qualification','posting'));

commit;
