-- Rollback for 20260817120000_workflow_engine_v1.sql
--
-- Restores the prior state exactly: the up-migration created SEVEN new
-- tables, TWELVE new functions and THREE triggers and touched nothing else
-- (no existing table, policy, grant, trigger or RPC was modified or
-- recreated). Dropping them removes only feature-created rows (all engine
-- rows live exclusively in the seven workflow_* tables). The consuming app
-- degrades honestly the moment the tables are gone (42P01/42883 →
-- "not enabled yet" state, nothing faked).
--
-- ORDER MATTERS: tables drop FIRST (their SELECT policies depend on the
-- definer visibility helpers — dropping a helper while its policy exists
-- fails with a dependency error; proven by scripts/db-proof/
-- workflow-engine-v1.sh, which runs this file verbatim), then the
-- functions.

begin;

-- Triggers (explicit, though the table drops below would remove them too).
drop trigger if exists workflow_transitions_append_only on public.workflow_transitions;
drop trigger if exists workflow_approvers_fill_once on public.workflow_instance_approvers;
drop trigger if exists workflow_version_steps_frozen on public.workflow_version_steps;

-- Tables (children first; policies fall with their tables).
drop table if exists public.workflow_transitions;
drop table if exists public.workflow_instance_approvers;
drop table if exists public.workflow_instance_steps;
drop table if exists public.workflow_instances;
drop table if exists public.workflow_version_steps;
drop table if exists public.workflow_definition_versions;
drop table if exists public.workflow_definitions;

-- Commands.
drop function if exists public.mark_overdue_workflow_steps_v1(text);
drop function if exists public.cancel_workflow_instance_v1(text, text);
drop function if exists public.withdraw_workflow_instance_v1(text, text);
drop function if exists public.delegate_workflow_step_v1(text, text, text);
drop function if exists public.decide_workflow_step_v1(text, text, text);
drop function if exists public.start_workflow_instance_v1(text, text, jsonb, text);
drop function if exists public.publish_workflow_version_v1(text);
drop function if exists public.create_workflow_definition_v1(text, text, text, text, jsonb);

-- Helpers + trigger functions.
drop function if exists public.workflow_resolve_step_approvers_v1(uuid, uuid, jsonb);
drop function if exists public.workflow_can_view_instance_v1(uuid);
drop function if exists public.workflow_can_view_version_v1(uuid);
drop function if exists public.workflow_can_view_definition_v1(uuid);
drop function if exists public.workflow_transitions_guard();
drop function if exists public.workflow_approver_fill_once_guard();
drop function if exists public.workflow_version_steps_frozen_guard();

commit;
