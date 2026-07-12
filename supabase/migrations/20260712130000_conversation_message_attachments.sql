-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260712130000 — conversation message attachments (user-journey root-cause
-- repair v1, finding #6: real work communication needs photos/files).
--
-- RED TIER by the owner rule (chat-visibility audit 2026-06-12): this
-- migration creates a storage bucket + storage.objects policies and touches
-- a CHECK constraint on conversation_messages → ships as a DRAFT PR and is
-- applied to prod only via Supabase MCP apply_migration after owner approval.
--
-- WHAT IT ADDS (mirrors the proven 0029 customer-request-attachments
-- pattern, adapted from single-owner to conversation-participant access):
--
--   1. public.conversation_message_attachments — metadata row per file,
--      append-only, INSERT via SECURITY DEFINER RPC only.
--   2. public.register_conversation_message_attachment(...) RPC — validates
--      author/participant/path/MIME/size server-side.
--   3. public.is_conversation_participant_path(text) helper — safe
--      storage-path → conversation-uuid participant check for storage RLS
--      (never throws on a malformed path; malformed = no access).
--   4. Private 'conversation-attachments' storage bucket + participant-
--      scoped storage.objects policies.
--   5. conversation_messages.body CHECK relaxed from 1..10000 to 0..10000
--      so an attachment-only message ('' body) is possible; the app layer
--      enforces "text OR at least one attachment" on send.
--
-- Path convention (enforced by RPC + storage policies):
--   <conversation_id>/<uploader_profile_id>/<attachment_id>/<safe_filename>
--
-- Privacy / safety:
--   - Bucket is private (public = false). No public CDN URLs anywhere;
--     reads go through short-lived signed URLs minted by the user-scoped
--     server client (which re-checks storage RLS).
--   - READ requires being an ACTIVE (non-revoked) conversation participant —
--     public.is_conversation_participant() is the same SECURITY DEFINER
--     helper the message RLS uses (single authorization source).
--   - WRITE additionally requires the second folder segment to equal the
--     uploader's own auth.uid() — a participant can never write into another
--     participant's folder.
--   - DELETE on storage is uploader-only (pre-send cancel/cleanup path).
--     Metadata rows are append-only: no UPDATE/DELETE policies, matching the
--     append-only conversation_messages doctrine.
--   - Admin read on metadata + storage mirrors the existing conversation
--     RLS (admins already read conversation_messages) — moderation parity,
--     never write access.
--
-- Rollback: supabase/rollbacks/20260712130000_conversation_message_attachments.down.sql
-- ============================================================================

-- ── 1. Metadata table ────────────────────────────────────────────────
create table if not exists public.conversation_message_attachments (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  message_id       uuid not null references public.conversation_messages(id) on delete cascade,
  uploader_id      uuid not null references public.profiles(id) on delete cascade,
  file_name        text not null check (char_length(file_name) between 1 and 255),
  mime_type        text not null check (char_length(mime_type) between 1 and 200),
  file_size_bytes  bigint not null check (file_size_bytes > 0 and file_size_bytes <= 10485760),
  storage_path     text not null unique,
  created_at       timestamptz not null default now()
);

create index if not exists conversation_message_attachments_message_idx
  on public.conversation_message_attachments (message_id, created_at);

create index if not exists conversation_message_attachments_conversation_idx
  on public.conversation_message_attachments (conversation_id, created_at desc);

-- ── 2. Row-level security (participant read; RPC-only writes) ────────
alter table public.conversation_message_attachments enable row level security;

drop policy if exists conversation_message_attachments_select
  on public.conversation_message_attachments;
create policy conversation_message_attachments_select
  on public.conversation_message_attachments for select
  using (public.is_conversation_participant(conversation_id) or public.is_admin());

drop policy if exists conversation_message_attachments_insert
  on public.conversation_message_attachments;
create policy conversation_message_attachments_insert
  on public.conversation_message_attachments for insert
  with check (false);
-- All INSERTs route through the SECURITY DEFINER RPC below.
-- No UPDATE/DELETE policies: attachment records are append-only, like
-- conversation_messages.

-- ── 3. Grants ────────────────────────────────────────────────────────
grant select on public.conversation_message_attachments to authenticated;

-- ── 4. Register-attachment RPC ───────────────────────────────────────
-- Called by the send server action AFTER the blob was uploaded to storage
-- and AFTER the message row was inserted. Asserts:
--   * caller is authenticated;
--   * the message exists, was authored by the caller, and belongs to the
--     claimed conversation;
--   * caller is an active participant of that conversation;
--   * storage_path begins with '<conversation_id>/<caller_uid>/';
--   * mime_type is in the allowlist; size within the 10 MB cap;
--   * at most 5 attachments per message.
create or replace function public.register_conversation_message_attachment(
  p_attachment_id   uuid,
  p_message_id      uuid,
  p_file_name       text,
  p_mime_type       text,
  p_file_size       bigint,
  p_storage_path    text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid              uuid := auth.uid();
  resolved_id      uuid;
  cleaned_name     text := nullif(trim(coalesce(p_file_name, '')), '');
  cleaned_mime     text := lower(nullif(trim(coalesce(p_mime_type, '')), ''));
  cleaned_path     text := nullif(trim(coalesce(p_storage_path, '')), '');
  expected_prefix  text;
  msg_author       uuid;
  msg_conversation uuid;
  existing_count   int;
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

  select author_id, conversation_id
    into msg_author, msg_conversation
    from public.conversation_messages
   where id = p_message_id;
  if msg_author is null then
    raise exception 'Message not found' using errcode = '42704';
  end if;
  if msg_author <> uid then
    raise exception 'Message not owned' using errcode = '42501';
  end if;

  -- Same authorization source as the message RLS: active participant only.
  if not public.is_conversation_participant(msg_conversation) then
    raise exception 'Not a conversation participant' using errcode = '42501';
  end if;

  -- Blob must live inside <conversation_id>/<uid>/ — the exact footprint
  -- the storage policies enforce.
  expected_prefix := msg_conversation::text || '/' || uid::text || '/';
  if position(expected_prefix in cleaned_path) <> 1 then
    raise exception 'storage_path does not start with %', expected_prefix
      using errcode = '22023';
  end if;

  select count(*) into existing_count
    from public.conversation_message_attachments
   where message_id = p_message_id;
  if existing_count >= 5 then
    raise exception 'Attachment limit reached (5 per message)' using errcode = '22023';
  end if;

  insert into public.conversation_message_attachments (
    id, conversation_id, message_id, uploader_id,
    file_name, mime_type, file_size_bytes, storage_path
  ) values (
    coalesce(p_attachment_id, gen_random_uuid()),
    msg_conversation,
    p_message_id,
    uid,
    cleaned_name,
    cleaned_mime,
    p_file_size,
    cleaned_path
  )
  returning id into resolved_id;

  return resolved_id;
end $$;

revoke all on function public.register_conversation_message_attachment(uuid, uuid, text, text, bigint, text) from public;
grant execute on function public.register_conversation_message_attachment(uuid, uuid, text, text, bigint, text) to authenticated;

-- ── 5. Storage-path participant helper (safe cast, never throws) ─────
create or replace function public.is_conversation_participant_path(
  p_object_name text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation uuid;
begin
  begin
    v_conversation := ((storage.foldername(p_object_name))[1])::uuid;
  exception when others then
    return false; -- Malformed path = no access, never an error.
  end;
  return public.is_conversation_participant(v_conversation);
end $$;

revoke all on function public.is_conversation_participant_path(text) from public;
grant execute on function public.is_conversation_participant_path(text) to authenticated;

-- ── 6. Private storage bucket ────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('conversation-attachments', 'conversation-attachments', false)
on conflict (id) do nothing;

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
     where id = 'conversation-attachments';
  exception when undefined_column then
    -- Storage extension lacks these columns; rely on app + RPC checks.
    null;
  end;
end $$;

-- ── 7. Storage object policies (participant-scoped) ──────────────────
-- Path convention enforced everywhere:
--   <conversation_id>/<uploader_profile_id>/<attachment_id>/<safe_filename>
-- Read = active participant of the conversation in folder segment 1.
-- Write/delete = participant AND folder segment 2 is the caller's own uid.

drop policy if exists "conversation-attachments participant select"
  on storage.objects;
create policy "conversation-attachments participant select"
  on storage.objects for select
  using (
    bucket_id = 'conversation-attachments'
    and auth.uid() is not null
    and public.is_conversation_participant_path(name)
  );

drop policy if exists "conversation-attachments participant insert"
  on storage.objects;
create policy "conversation-attachments participant insert"
  on storage.objects for insert
  with check (
    bucket_id = 'conversation-attachments'
    and auth.uid() is not null
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_conversation_participant_path(name)
  );

drop policy if exists "conversation-attachments uploader delete"
  on storage.objects;
create policy "conversation-attachments uploader delete"
  on storage.objects for delete
  using (
    bucket_id = 'conversation-attachments'
    and auth.uid() is not null
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "conversation-attachments admin select"
  on storage.objects;
create policy "conversation-attachments admin select"
  on storage.objects for select
  using (
    bucket_id = 'conversation-attachments'
    and public.is_admin()
  );

-- ── 8. Attachment-only messages: relax the body CHECK to 0..10000 ────
-- The app layer (sendMessage) enforces "non-empty text OR ≥1 attachment".
alter table public.conversation_messages
  drop constraint if exists conversation_messages_body_check;
alter table public.conversation_messages
  add constraint conversation_messages_body_check
  check (char_length(body) between 0 and 10000);
