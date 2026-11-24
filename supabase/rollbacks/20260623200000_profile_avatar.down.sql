-- ROLLBACK for 20260623200000_profile_avatar.sql
-- Reverses the profile-avatar migration. Run ONLY to undo it. Fully reversible:
-- the avatar_url column is additive, the bucket + policies are new. No data
-- outside the avatar bucket / column is touched.

begin;

drop policy if exists "profile-avatars owner select" on storage.objects;
drop policy if exists "profile-avatars owner insert" on storage.objects;
drop policy if exists "profile-avatars owner update" on storage.objects;
drop policy if exists "profile-avatars owner delete" on storage.objects;

delete from storage.buckets where id = 'profile-avatars';

alter table public.profiles drop column if exists avatar_url;

commit;