-- ============================================================================
-- ROLLBACK for 20260627143433_w10_projects_org_backfill.sql
--
-- Scoped to EXACTLY the 4 project ids that the backfill rerouted (all were
-- organization_id NULL before). Reverting sets those same rows back to NULL and
-- touches nothing else. company_id is left unchanged (it was never modified).
-- If you also want to stop recurrence without reverting data, no rollback is
-- needed — the app-side creation fix already prevents new org-less projects.
-- ============================================================================

update public.projects
   set organization_id = null, updated_at = now()
 where id in (
   '562c9c3e-4c94-4ad7-9a7f-6c860cdf0bfe',
   '610647b3-9fed-4c33-a760-6b16f1037d55',
   'eaa9ea10-57a6-4d70-aee3-564f311b203b',
   'dd7274e9-0364-4bf9-aa38-32dd24522def'
 );
