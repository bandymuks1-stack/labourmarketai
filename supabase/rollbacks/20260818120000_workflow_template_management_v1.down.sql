-- Rollback for 20260818120000_workflow_template_management_v1.sql
--
-- Restores the prior state exactly: the up-migration created THREE new
-- functions and their EXECUTE grants and touched nothing else — no table, no
-- column, no policy, no trigger, no existing function was created, modified
-- or recreated, and no row was written at apply time. Dropping the three
-- functions therefore restores the engine's pre-migration surface exactly.
--
-- DELIBERATELY NO DATA DELETION. A definition, version or step that
-- install_default_workflow_pack_v1 or create_workflow_definition_version_v1
-- created is ordinary Workflow & Approval Engine data. Deleting it would
-- destroy the approval history of every instance that ever ran on it, and
-- workflow_transitions is append-only by trigger for exactly that reason.
-- The rows stay; only the commands that can create more of them go away.
--
-- The consuming app degrades honestly the moment the functions are gone
-- (42883 / PGRST202 → the "prepared but not enabled yet" notice, nothing
-- faked, nothing pretending to have saved).

begin;

drop function if exists public.install_default_workflow_pack_v1(text);
drop function if exists public.set_workflow_definition_active_v1(text, text);
drop function if exists public.create_workflow_definition_version_v1(text, jsonb);

commit;
