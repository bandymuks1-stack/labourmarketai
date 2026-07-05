-- ============================================================================
-- DOWN — 20260705240000_journal_photos_project_gallery (owner-run manual
-- rollback).
--
-- The up migration is ADDITIVE, POLICY-ONLY: two new SELECT policies that
-- mirror the 0013 journal_entries manager boundary onto journal_entry_photos
-- metadata and the private 'journal-entry-photos' storage objects. It created
-- no table, no bucket, no function, no grant and wrote no rows — so the down
-- is exactly the two policy drops and nothing else.
--
-- ROLLBACK-CHAIN RULE: 20260705240000 recreated NO existing policy, RPC or
-- trigger (both policy names are new). This down file therefore contains no
-- `create policy` / `create function` — there is no prior body to restore.
-- The owner-scoped worker policies and the admin read from 20260612091000
-- remain untouched in both directions.
-- ============================================================================

begin;

drop policy if exists journal_entry_photos_select_org_manager
  on public.journal_entry_photos;

drop policy if exists "journal-entry-photos org manager select"
  on storage.objects;

commit;
