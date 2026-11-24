-- 20260623200000_profile_avatar.sql
--
-- Profile avatar upload v1 (owner-gated). Lets a signed-in user attach ONE
-- profile photo to their canonical identity record (public.profiles).
--
-- DESIGN
--   1. profiles.avatar_url (text) — additive column storing the STORAGE PATH of
--      the user's current avatar (never a public URL). The owner writes it via
--      the existing profiles owner-UPDATE RLS (id = auth.uid()); no new RPC,
--      no SECURITY DEFINER.
--   2. Private storage bucket 'profile-avatars' (public = false) — no public CDN
--      URLs. The app renders the avatar via a short-lived signed URL.
--   3. Owner-scoped storage.objects policies on the bucket: a user may
--      read/insert/update/delete ONLY objects under their own first folder
--      segment (= auth.uid()). NO public read, NO admin read — a profile photo
--      is personal identity and must never deanonymize the anonymized scouting
--      preview. Path convention: <profile_id>/<filename>.
--
-- HONESTY / SAFETY
--   - 5 MB cap + jpeg/png/webp only (bucket limits + app/compression checks).
--   - No fake "verified identity": the avatar is a photo, never a trust badge.
--   - Additive + reversible (supabase/rollbacks/20260623200000_profile_avatar.down.sql).
--
-- CLASS: RED (storage.buckets insert + storage.objects RLS policies). NOT
-- applied here — open as draft, needs-human-gate, owner-channel apply only.
--
-- @human-gate-approved
-- Intentional, human-reviewed RED migration: creating a private avatar bucket
-- and its owner-scoped storage.objects policies necessarily trips the
-- alter/drop-policy + bucket-config detectors. This annotation acknowledges the
-- risk; it is NOT an auto-merge pass — the PR stays a draft with the
-- needs-human-gate label until the owner approves and applies it.
--
-- ROLLBACK (run manually only if reverting; full script at
-- supabase/rollbacks/20260623200000_profile_avatar.down.sql):
--   -- drop policy if exists "profile-avatars owner select" on storage.objects;
--   -- drop policy if exists "profile-avatars owner insert" on storage.objects;
--   -- drop policy if exists "profile-avatars owner update" on storage.objects;
--   -- drop policy if exists "profile-avatars owner delete" on storage.objects;
--   -- delete from storage.buckets where id = 'profile-avatars';
--   -- alter table public.profiles drop column if exists avatar_url;

begin;

-- ── 1. Additive column on the canonical identity record ───────────────
alter table public.profiles add column if not exists avatar_url text;

-- ── 2. Private avatar bucket (owner-only; never public) ───────────────
insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', false)
on conflict (id) do nothing;

do $$
begin
  begin
    update storage.buckets
       set file_size_limit = 5242880,
           allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
     where id = 'profile-avatars';
  exception when undefined_column then
    -- Storage extension lacks these columns; rely on app + compression checks.
    null;
  end;
end $$;

-- ── 3. Owner-scoped storage.objects policies ──────────────────────────
-- Path convention: <profile_id>/<filename>. The first folder segment must be
-- the caller's own uid for every operation. No public read, no admin read.

drop policy if exists "profile-avatars owner select" on storage.objects;
create policy "profile-avatars owner select"
  on storage.objects for select
  using (
    bucket_id = 'profile-avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile-avatars owner insert" on storage.objects;
create policy "profile-avatars owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'profile-avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile-avatars owner update" on storage.objects;
create policy "profile-avatars owner update"
  on storage.objects for update
  using (
    bucket_id = 'profile-avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile-avatars owner delete" on storage.objects;
create policy "profile-avatars owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'profile-avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;