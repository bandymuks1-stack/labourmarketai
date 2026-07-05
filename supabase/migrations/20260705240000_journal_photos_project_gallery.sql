-- 20260705240000_journal_photos_project_gallery.sql
--
-- Project work gallery read scope (CR train WAGON 8, areas 15/16).
--
-- ADDITIVE ONLY: two SELECT policies that extend the existing journal photo
-- evidence (20260612091000) to the SAME manager audience that can already
-- read the parent journal_entries rows — a manager of the entry's engagement
-- organization (0013 journal_entries_select). Nothing here is broader than
-- what a manager can already see about the entry itself; the photo simply
-- becomes visible alongside the entry it belongs to.
--
--   1. journal_entry_photos: org managers may LIST photo metadata rows of
--      entries their journal_entries RLS already lets them read.
--   2. storage.objects: the same audience may mint short-lived signed URLs
--      for those photos (bucket stays private; no public CDN URLs).
--
-- No new table, no new bucket, no write/delete access widened, no worker-side
-- change. Workers keep owner-only access; admin read stays as-is.
--
-- ROLLBACK (run manually only if reverting):
--   -- drop policy if exists journal_entry_photos_select_org_manager on public.journal_entry_photos;
--   -- drop policy if exists "journal-entry-photos org manager select" on storage.objects;

-- ── 1. Metadata rows: mirror the journal_entries manager-read boundary ──
drop policy if exists journal_entry_photos_select_org_manager
  on public.journal_entry_photos;
create policy journal_entry_photos_select_org_manager
  on public.journal_entry_photos for select
  using (
    exists (
      select 1
        from public.journal_entries je
        join public.engagement_contexts ec on ec.id = je.engagement_context_id
       where je.id = journal_entry_photos.entry_id
         and public.manages_organization(ec.organization_id)
    )
  );

-- ── 2. Storage objects: same audience, signed-URL reads only ────────────
-- Path convention pinned by 20260612091000:
--   <profile_id>/<entry_id>/<photo_id>/<original_filename>
-- The SECOND folder segment is the entry id, so the object inherits exactly
-- the parent entry's manager boundary.
drop policy if exists "journal-entry-photos org manager select"
  on storage.objects;
create policy "journal-entry-photos org manager select"
  on storage.objects for select
  using (
    bucket_id = 'journal-entry-photos'
    and auth.uid() is not null
    and exists (
      select 1
        from public.journal_entries je
        join public.engagement_contexts ec on ec.id = je.engagement_context_id
       where je.id::text = (storage.foldername(name))[2]
         and public.manages_organization(ec.organization_id)
    )
  );
