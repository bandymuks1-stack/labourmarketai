-- 20260612091000_journal_entry_photos.sql
--
-- Work-report photo evidence v1 (owner smoke item 5).
--
-- A worker can attach ONE photo to a work journal entry on the free tier.
-- More photos / extended evidence are a future VIP/Pro feature — the UI states
-- this honestly; the 1-photo cap is ENFORCED HERE (server-side), not just in
-- copy. Mirrors the proven 0029 customer-request-attachments pattern:
--
--   1. public.journal_entry_photos — metadata row per photo.
--   2. register_journal_entry_photo RPC — the ONLY insert path; asserts
--      ownership of the entry, an owner-scoped storage path, an image MIME,
--      the 5 MB size cap, and the FREE-TIER LIMIT of 1 photo per entry
--      (errcode 22023 'photo_limit_reached').
--   3. Private storage bucket 'journal-entry-photos' + owner-scoped
--      storage.objects policies (first folder segment = auth.uid()).
--
-- Privacy / honesty:
--   - Bucket is private (public = false); no public CDN URLs.
--   - No fake analysis/verification: the photo is stored evidence only.
--   - Admin may read (manual review), never write/delete.
--
-- ROLLBACK (run manually only if reverting):
--   -- drop policy if exists "journal-entry-photos owner select" on storage.objects;
--   -- drop policy if exists "journal-entry-photos owner insert" on storage.objects;
--   -- drop policy if exists "journal-entry-photos owner delete" on storage.objects;
--   -- drop policy if exists "journal-entry-photos admin select" on storage.objects;
--   -- delete from storage.buckets where id = 'journal-entry-photos';
--   -- drop function if exists public.register_journal_entry_photo(uuid, uuid, text, text, bigint, text);
--   -- drop table if exists public.journal_entry_photos;

-- ── 1. Metadata table ────────────────────────────────────────────────
create table if not exists public.journal_entry_photos (
  id              uuid primary key default gen_random_uuid(),
  entry_id        uuid not null references public.journal_entries(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  file_name       text not null check (char_length(file_name) between 1 and 255),
  mime_type       text not null check (char_length(mime_type) between 1 and 200),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 5242880),
  storage_path    text not null unique,
  upload_status   text not null default 'uploaded'
                    check (upload_status in ('uploading','uploaded','removed','failed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists journal_entry_photos_entry_idx
  on public.journal_entry_photos (entry_id, created_at desc);

create index if not exists journal_entry_photos_profile_idx
  on public.journal_entry_photos (profile_id, created_at desc);

-- ── 2. Row-level security ────────────────────────────────────────────
alter table public.journal_entry_photos enable row level security;

drop policy if exists journal_entry_photos_select on public.journal_entry_photos;
create policy journal_entry_photos_select on public.journal_entry_photos for select
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists journal_entry_photos_insert on public.journal_entry_photos;
create policy journal_entry_photos_insert on public.journal_entry_photos for insert
  with check (false);
-- All INSERTs route through the SECURITY DEFINER RPC below.

drop policy if exists journal_entry_photos_update on public.journal_entry_photos;
create policy journal_entry_photos_update on public.journal_entry_photos for update
  using (profile_id = auth.uid());

drop policy if exists journal_entry_photos_delete on public.journal_entry_photos;
create policy journal_entry_photos_delete on public.journal_entry_photos for delete
  using (profile_id = auth.uid());

-- ── 3. Grants ────────────────────────────────────────────────────────
grant select, update, delete on public.journal_entry_photos to authenticated;
-- INSERT only via the RPC.

-- ── 4. Register-photo RPC (enforces the FREE 1-photo cap) ────────────
create or replace function public.register_journal_entry_photo(
  p_photo_id     uuid,
  p_entry_id     uuid,
  p_file_name    text,
  p_mime_type    text,
  p_file_size    bigint,
  p_storage_path text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid             uuid := auth.uid();
  resolved_id     uuid;
  cleaned_name    text := nullif(trim(coalesce(p_file_name, '')), '');
  cleaned_mime    text := lower(nullif(trim(coalesce(p_mime_type, '')), ''));
  cleaned_path    text := nullif(trim(coalesce(p_storage_path, '')), '');
  expected_prefix text;
  entry_owner     uuid;
  existing_count  integer;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if cleaned_name is null or char_length(cleaned_name) > 255 then
    raise exception 'Invalid file_name' using errcode = '22023';
  end if;

  if cleaned_mime is null or cleaned_mime not in (
    'image/jpeg',
    'image/png',
    'image/webp'
  ) then
    raise exception 'unsupported_mime_type' using errcode = '22023';
  end if;

  if p_file_size is null or p_file_size <= 0 or p_file_size > 5242880 then
    raise exception 'file_too_large' using errcode = '22023';
  end if;

  if cleaned_path is null or char_length(cleaned_path) > 1024 then
    raise exception 'Invalid storage_path' using errcode = '22023';
  end if;

  -- Caller must own the journal entry (workers.profile_id chain).
  select w.profile_id into entry_owner
    from public.journal_entries je
    join public.workers w on w.id = je.worker_id
   where je.id = p_entry_id;
  if entry_owner is null then
    raise exception 'Entry not found' using errcode = '42704';
  end if;
  if entry_owner <> uid then
    raise exception 'Entry not owned' using errcode = '42501';
  end if;

  -- FREE-TIER LIMIT: one photo per entry. Honest, server-enforced. More
  -- photos are a future VIP/Pro feature; nothing here fakes that tier.
  select count(*) into existing_count
    from public.journal_entry_photos
   where entry_id = p_entry_id
     and upload_status in ('uploading','uploaded');
  if existing_count >= 1 then
    raise exception 'photo_limit_reached' using errcode = '22023';
  end if;

  expected_prefix := uid::text || '/' || p_entry_id::text || '/';
  if position(expected_prefix in cleaned_path) <> 1 then
    raise exception 'storage_path does not start with %', expected_prefix
      using errcode = '22023';
  end if;

  insert into public.journal_entry_photos (
    id, entry_id, profile_id, file_name, mime_type, file_size_bytes, storage_path
  ) values (
    coalesce(p_photo_id, gen_random_uuid()),
    p_entry_id,
    uid,
    cleaned_name,
    cleaned_mime,
    p_file_size,
    cleaned_path
  )
  returning id into resolved_id;

  return resolved_id;
end $$;

revoke all on function public.register_journal_entry_photo(uuid, uuid, text, text, bigint, text) from public;
grant execute on function public.register_journal_entry_photo(uuid, uuid, text, text, bigint, text) to authenticated;

-- ── 5. Private storage bucket ────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('journal-entry-photos', 'journal-entry-photos', false)
on conflict (id) do nothing;

do $$
begin
  begin
    update storage.buckets
       set file_size_limit = 5242880,
           allowed_mime_types = array[
             'image/jpeg',
             'image/png',
             'image/webp'
           ]
     where id = 'journal-entry-photos';
  exception when undefined_column then
    -- Storage extension lacks these columns; rely on app + RPC checks.
    null;
  end;
end $$;

-- ── 6. Storage object policies (per-bucket, owner-scoped) ────────────
-- Path convention enforced everywhere:
--   <profile_id>/<entry_id>/<photo_id>/<original_filename>

drop policy if exists "journal-entry-photos owner select"
  on storage.objects;
create policy "journal-entry-photos owner select"
  on storage.objects for select
  using (
    bucket_id = 'journal-entry-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "journal-entry-photos owner insert"
  on storage.objects;
create policy "journal-entry-photos owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'journal-entry-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "journal-entry-photos owner delete"
  on storage.objects;
create policy "journal-entry-photos owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'journal-entry-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "journal-entry-photos admin select"
  on storage.objects;
create policy "journal-entry-photos admin select"
  on storage.objects for select
  using (
    bucket_id = 'journal-entry-photos'
    and public.is_admin()
  );
