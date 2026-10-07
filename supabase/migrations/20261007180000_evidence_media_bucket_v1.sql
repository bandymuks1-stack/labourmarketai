-- @human-gate-approved
--
-- NO OWNER DECISION EXISTS FOR THIS FILE YET. The marker above is the risk
-- ACKNOWLEDGEMENT the static gate reads (storage bucket + storage.objects
-- policies are a privilege-surface change). It is not an approval; the control
-- is the human gate (draft PR + `needs-human-gate`).
-- ============================================================================
-- 20261007180000_evidence_media_bucket_v1.sql
--
-- SAFETY CLASS: RED (storage policies decide who may download/upload bytes).
-- NOT applied. Apply ONLY after explicit owner approval, ONLY via Supabase MCP
-- `apply_migration` - NEVER `supabase db push`.
-- Prerequisite: 20261007100000_evidence_record_media_link_v1 (the table
-- public.organization_evidence_media) must already be applied.
--
-- WHAT THIS ADDS (no existing object is altered)
--   1. ONE private bucket `evidence-media` (20 MB per object; jpeg/png/webp/heic).
--   2. Three storage.objects policies, scoped to that bucket only:
--      SELECT  an object is readable iff its REGISTERED organization_evidence_media
--              row is readable by the caller UNDER THAT TABLE'S RLS (the table
--              truth decides, never the path alone - same delegation as
--              "document-files entity read"). One extra branch: an UNREGISTERED
--              object under an organization the caller manages, so the writer
--              can find and clean up its own orphan.
--      INSERT  only under  org/<organization_id>/...  where the caller
--              manages_organization(<organization_id>).
--      DELETE  orphan cleanup ONLY: same prefix scope, and never an object that
--              is registered in organization_evidence_media. A registered
--              photo cannot be removed from the client.
--   3. No anon, no PUBLIC, no USING (true), no UPDATE policy, no public bucket.
--
-- PATH CONTRACT (pinned by these policies and by the writer):
--   org/<organization_id>/<sha256>.<ext>
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence-media', 'evidence-media', false, 20971520,
  array['image/jpeg','image/png','image/webp','image/heic']
)
on conflict (id) do nothing;

create policy "evidence-media entity read"
  on storage.objects for select
  using (
    bucket_id = 'evidence-media'
    and auth.uid() is not null
    and (
      exists (
        select 1 from public.organization_evidence_media m
         where m.storage_path = storage.objects.name
      )
      or (
        not exists (
          select 1 from public.organization_evidence_media m
           where m.storage_path = storage.objects.name
        )
        and (storage.foldername(name))[1] = 'org'
        and case
              when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then public.manages_organization(((storage.foldername(name))[2])::uuid)
              else false
            end
      )
    )
  );

create policy "evidence-media scoped insert"
  on storage.objects for insert
  with check (
    bucket_id = 'evidence-media'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = 'org'
    and case
          when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then public.manages_organization(((storage.foldername(name))[2])::uuid)
          else false
        end
  );

create policy "evidence-media orphan delete"
  on storage.objects for delete
  using (
    bucket_id = 'evidence-media'
    and auth.uid() is not null
    and not exists (
      select 1 from public.organization_evidence_media m
       where m.storage_path = storage.objects.name
    )
    and (storage.foldername(name))[1] = 'org'
    and case
          when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then public.manages_organization(((storage.foldername(name))[2])::uuid)
          else false
        end
  );

-- ROLLBACK (also shipped as supabase/rollbacks/20261007180000_evidence_media_bucket_v1.down.sql)
--   do $rb$ begin
--     if exists (select 1 from storage.objects where bucket_id = 'evidence-media') then
--       raise exception 'evidence-media holds objects; refusing to drop (export first)';
--     end if;
--   end $rb$;
--   drop policy if exists "evidence-media orphan delete" on storage.objects;
--   drop policy if exists "evidence-media scoped insert" on storage.objects;
--   drop policy if exists "evidence-media entity read" on storage.objects;
--   delete from storage.buckets where id = 'evidence-media';
