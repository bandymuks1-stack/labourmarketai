-- Rollback for 20260702140000_worker_personal_engagement.sql
-- Removes the provisioning trigger + function. The engagement rows already
-- created (trigger or backfill) are intentionally NOT deleted: they are
-- plain owner-scoped personal engagements and removing them would re-close
-- the journal for those workers. If a full data rollback is ever required:
--   delete from public.engagement_contexts
--    where relationship_slug = 'employee' and organization_id is null
--      and project_id is null;  -- review before running; owner decision.

drop trigger if exists on_worker_personal_engagement on public.workers;
drop function if exists public.ensure_worker_personal_engagement();
