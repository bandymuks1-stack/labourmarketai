-- 0029 — Customer/Buyer request attachments (Stage 2 attachments PR 1).
--
-- Adds file attachments to the real buyer demand/request flow shipped
-- in 0028. The buyer attaches files (PDF / JPG / PNG / WebP / TXT,
-- up to 10 MB) to an existing customer_requests row.
--
-- Two new objects in this migration:
--
--   1. public.customer_request_attachments — metadata row per file.
--   2. storage.buckets / storage.objects policies for the private
--      'customer-request-attachments' bucket where the binary blobs
--      actually live.
--
-- Privacy / safety (binding from sprint §4.C + §10):
--   - Bucket is private (public = false). No public CDN URLs are
--     handed out anywhere in the app; readers go through the signed
--     URL or user-scoped Supabase storage client.
--   - Storage objects are owner-scoped by the *first folder segment*
--     of the object key, which the app forces to be the uploader's
--     profile id. Owners cannot read/write outside their own folder.
--   - Admin can read all storage objects in this bucket (manual
--     review path), but not write or delete (admin sees what the
--     buyer uploaded — admin doesn't tamper with the original blob).
--
-- Analysis fields (analysis_status / extracted_text /
-- structured_summary) are intentionally left NULL by this migration
-- and by PR 1 — the sprint requires *honest* metadata-only Level 1
-- behaviour first. Future PRs may flip analysis_status to
-- 'extracted' / 'structured' once a real extractor/AI is wired and
-- validated. No fake AI / OCR / verification is performed by this
-- migration or its companion code.
--
-- Application status:
--   File ships in this PR. Application to prod is OWNER-GATED. The
--   UI degrades gracefully via 42P01 / 42883 detection until the
--   owner authorises apply.

-- ── 1. Metadata table ────────────────────────────────────────────────
create table if not exists public.customer_request_attachments (
  id                   uuid primary key default gen_random_uuid(),
  request_id           uuid not null references public.customer_requests(id) on delete cascade,
  profile_id           uuid not null references public.profiles(id) on delete cascade,
  file_name            text not null check (char_length(file_name) between 1 and 255),
  mime_type            text not null check (char_length(mime_type) between 1 and 200),
  file_size_bytes      bigint not null check (file_size_bytes > 0 and file_size_bytes <= 10485760),
  storage_path         text not null unique,
  upload_status        text not null default 'uploaded'
                         check (upload_status in ('uploading','uploaded','removed','failed')),
  analysis_status      text not null default 'not_started'
                         check (analysis_status in
                           ('not_started','extracted','needs_manual_review','structured','failed')),
  extracted_text       text,
  structured_summary   jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists customer_request_attachments_request_idx
  on public.customer_request_attachments (request_id, created_at desc);

create index if not exists customer_request_attachments_profile_idx
  on public.customer_request_attachments (profile_id, created_at desc);

-- ── 2. Row-level security ────────────────────────────────────────────
alter table public.customer_request_attachments enable row level security;

drop policy if exists customer_request_attachments_select on public.customer_request_attachments;
create policy customer_request_attachments_select on public.customer_request_attachments for select
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists customer_request_attachments_insert on public.customer_request_attachments;
create policy customer_request_attachments_insert on public.customer_request_attachments for insert
  with check (false);
-- All INSERTs route through the SECURITY DEFINER RPC below.

drop policy if exists customer_request_attachments_update on public.customer_request_attachments;
create policy customer_request_attachments_update on public.customer_request_attachments for update
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists customer_request_attachments_delete on public.customer_request_attachments;
create policy customer_request_attachments_delete on public.customer_request_attachments for delete
  using (profile_id = auth.uid() or public.is_admin());

-- ── 3. Grants ────────────────────────────────────────────────────────
grant select, update, delete on public.customer_request_attachments to authenticated;
-- INSERT via RPC; bypass requires admin path (covered by is_admin()).

-- ── 4. Register-attachment RPC ───────────────────────────────────────
-- Called by the server action AFTER the blob has been uploaded to
-- storage. Inserts the metadata row. Asserts:
--   * caller is authenticated;
--   * caller owns the target customer_request;
--   * storage_path begins with '<caller_uid>/<request_id>/';
--   * mime_type is in the allowlist;
--   * file_size_bytes is within the 10 MB cap.
-- Returns the new attachment id.
create or replace function public.register_customer_request_attachment(
  p_attachment_id  uuid,
  p_request_id     uuid,
  p_file_name      text,
  p_mime_type      text,
  p_file_size      bigint,
  p_storage_path   text
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
  request_owner   uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if cleaned_name is null or char_length(cleaned_name) > 255 then
    raise exception 'Invalid file_name' using errcode = '22023';
  end if;

  if cleaned_mime is null or cleaned_mime not in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain'
  ) then
    raise exception 'Unsupported mime_type' using errcode = '22023';
  end if;

  if p_file_size is null or p_file_size <= 0 or p_file_size > 10485760 then
    raise exception 'File size out of range (1..10 MB)' using errcode = '22023';
  end if;

  if cleaned_path is null or char_length(cleaned_path) > 1024 then
    raise exception 'Invalid storage_path' using errcode = '22023';
  end if;

  -- Owner must own the parent request.
  select profile_id into request_owner
    from public.customer_requests
   where id = p_request_id;
  if request_owner is null then
    raise exception 'Request not found' using errcode = '42704';
  end if;
  if request_owner <> uid and not public.is_admin() then
    raise exception 'Request not owned' using errcode = '42501';
  end if;

  -- Storage path must live inside the owner's own folder, under the
  -- target request's subfolder. This pins the blob to the same RLS
  -- footprint the storage policies enforce.
  expected_prefix := uid::text || '/' || p_request_id::text || '/';
  if position(expected_prefix in cleaned_path) <> 1 then
    raise exception 'storage_path does not start with %', expected_prefix
      using errcode = '22023';
  end if;

  insert into public.customer_request_attachments (
    id, request_id, profile_id, file_name, mime_type, file_size_bytes, storage_path
  ) values (
    coalesce(p_attachment_id, gen_random_uuid()),
    p_request_id,
    uid,
    cleaned_name,
    cleaned_mime,
    p_file_size,
    cleaned_path
  )
  returning id into resolved_id;

  return resolved_id;
end $$;

revoke all on function public.register_customer_request_attachment(uuid, uuid, text, text, bigint, text) from public;
grant execute on function public.register_customer_request_attachment(uuid, uuid, text, text, bigint, text) to authenticated;

-- ── 5. Private storage bucket ────────────────────────────────────────
insert into storage.buckets (id, name, public)
values (
  'customer-request-attachments',
  'customer-request-attachments',
  false
)
on conflict (id) do nothing;

-- Tighten bucket-level file size + MIME allowlist on storage extensions
-- that expose those columns. Older Supabase versions don't have them,
-- in which case the app-layer + RPC checks above are the source of truth.
do $$
begin
  begin
    update storage.buckets
       set file_size_limit = 10485760,
           allowed_mime_types = array[
             'application/pdf',
             'image/jpeg',
             'image/png',
             'image/webp',
             'text/plain'
           ]
     where id = 'customer-request-attachments';
  exception when undefined_column then
    -- Storage extension lacks these columns; rely on app + RPC checks.
    null;
  end;
end $$;

-- ── 6. Storage object policies (per-bucket, owner-scoped) ────────────
-- Path convention enforced everywhere:
--   <profile_id>/<request_id>/<attachment_id>/<original_filename>
-- The first folder segment (profile_id::text) gates ownership.

drop policy if exists "customer-request-attachments owner select"
  on storage.objects;
create policy "customer-request-attachments owner select"
  on storage.objects for select
  using (
    bucket_id = 'customer-request-attachments'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "customer-request-attachments owner insert"
  on storage.objects;
create policy "customer-request-attachments owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'customer-request-attachments'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "customer-request-attachments owner delete"
  on storage.objects;
create policy "customer-request-attachments owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'customer-request-attachments'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "customer-request-attachments admin select"
  on storage.objects;
create policy "customer-request-attachments admin select"
  on storage.objects for select
  using (
    bucket_id = 'customer-request-attachments'
    and public.is_admin()
  );
