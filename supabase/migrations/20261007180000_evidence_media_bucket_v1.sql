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
-- public.organization_evidence_media) must already be applied (it is).
--
-- WHAT THIS ADDS
--   1. ONE private bucket `evidence-media` (20 MB per object; jpeg/png/webp/heic).
--      If a bucket with that id already exists and is public, the migration
--      ABORTS instead of silently keeping a public bucket.
--   2. Three storage.objects policies, scoped to that bucket and to the
--      `authenticated` role only:
--      SELECT  an object is readable iff its REGISTERED organization_evidence_media
--              row is readable by the caller UNDER THAT TABLE'S RLS (the table
--              truth decides, never the path alone - same delegation as
--              "document-files entity read"). One extra branch: an UNREGISTERED
--              object under an organization the caller manages, so the writer
--              can find and clean up its own orphan.
--      INSERT  only under  org/<organization_id>/<sha256>.<ext>  where the caller
--              manages_organization(<organization_id>).
--      DELETE  orphan cleanup ONLY: same strict path, and never an object that
--              is registered in organization_evidence_media. A registered
--              photo cannot be removed from the client.
--   3. One BEFORE INSERT trigger on public.organization_evidence_media
--      (INVOKER, not SECURITY DEFINER) that pins the registered path to the
--      row's own organization and content hash:
--          storage_bucket = 'evidence-media'
--          storage_path   = 'org/<organization_id>/<content_sha256>.<ext by mime>'
--      WHY: the already-applied table policy admits any path string. Without
--      this pin a manager of organization B could register a row whose
--      storage_path points INSIDE organization A's prefix; that row is visible
--      to B under the table's RLS, so the SELECT delegation would then expose
--      A's bytes to B (and squat A's content-addressed path, blocking A's own
--      registration through unique(storage_path)).
--   4. No anon, no PUBLIC, no USING (true), no UPDATE policy (so an upload can
--      never overwrite an existing object), no public bucket.
--
-- PATH CONTRACT (pinned by these policies, by the trigger and by the writer):
--   org/<organization_id lowercase uuid>/<64 lowercase hex sha256>.<jpg|png|webp|heic>
--   Exactly three segments; no '..', no extra folder, no other filename shape.
--   Every policy checks the WHOLE name against one anchored regex, and the
--   uuid cast happens only inside a CASE branch that has already matched it.
--
-- STORAGE-OWNER NOTE: storage.objects is owned by supabase_storage_admin; the
-- migration role used by Supabase MCP `apply_migration` can create policies on
-- it (the document-files / journal-entry-photos migrations already do).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence-media', 'evidence-media', false, 20971520,
  array['image/jpeg','image/png','image/webp','image/heic']
)
on conflict (id) do nothing;

-- A pre-existing bucket would be kept by the insert above. Refuse to proceed
-- unless it is private.
do $assert$
begin
  if exists (select 1 from storage.buckets where id = 'evidence-media' and public is distinct from false) then
    raise exception 'bucket evidence-media exists and is public; refusing to apply'
      using errcode = '55000';
  end if;
end
$assert$;

-- Registered path == the row's own organization + content hash + mime extension.
create or replace function public.organization_evidence_media_path_pin_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.storage_bucket is distinct from 'evidence-media' then
    raise exception 'organization_evidence_media: storage_bucket must be evidence-media'
      using errcode = '23514';
  end if;
  if new.storage_path is distinct from (
    'org/' || new.organization_id::text || '/' || new.content_sha256 || '.' ||
    case new.mime_type
      when 'image/jpeg' then 'jpg'
      when 'image/png'  then 'png'
      when 'image/webp' then 'webp'
      when 'image/heic' then 'heic'
    end
  ) then
    raise exception 'organization_evidence_media: storage_path must be org/<organization_id>/<sha256>.<ext>'
      using errcode = '23514';
  end if;
  return new;
end
$fn$;

create trigger organization_evidence_media_path_pin
  before insert on public.organization_evidence_media
  for each row execute function public.organization_evidence_media_path_pin_v1();

create policy "evidence-media entity read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'evidence-media'
    and auth.uid() is not null
    and name ~ '^org/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}\.(jpg|png|webp|heic)$'
    and (
      -- registered: the table's RLS decides; the row must belong to the
      -- organization whose prefix the object sits under.
      exists (
        select 1 from public.organization_evidence_media m
         where m.storage_path = storage.objects.name
           and m.organization_id::text = split_part(storage.objects.name, '/', 2)
      )
      -- unregistered orphan: only a manager of the prefix organization.
      or (
        not exists (
          select 1 from public.organization_evidence_media m
           where m.storage_path = storage.objects.name
        )
        and case
              when storage.objects.name ~ '^org/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                then public.manages_organization(split_part(storage.objects.name, '/', 2)::uuid)
              else false
            end
      )
    )
  );

create policy "evidence-media scoped insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'evidence-media'
    and auth.uid() is not null
    and name ~ '^org/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}\.(jpg|png|webp|heic)$'
    and case
          when name ~ '^org/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
            then public.manages_organization(split_part(name, '/', 2)::uuid)
          else false
        end
  );

create policy "evidence-media orphan delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'evidence-media'
    and auth.uid() is not null
    and name ~ '^org/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{64}\.(jpg|png|webp|heic)$'
    and not exists (
      select 1 from public.organization_evidence_media m
       where m.storage_path = storage.objects.name
    )
    and case
          when name ~ '^org/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
            then public.manages_organization(split_part(name, '/', 2)::uuid)
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
--   drop trigger if exists organization_evidence_media_path_pin on public.organization_evidence_media;
--   drop function if exists public.organization_evidence_media_path_pin_v1();
--   delete from storage.buckets where id = 'evidence-media';
