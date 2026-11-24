-- Rollback for 20260817190000_employee_lifecycle_v1.sql
--
-- Restores the prior state exactly: drops ONLY the 1 trigger, 16 new
-- functions, 7 new tables and the 4 new engagement_contexts columns this
-- migration added. No pre-existing object was touched by the up migration,
-- so nothing is recreated here.
--
-- HONESTY NOTES:
--   * Dropping the 4 columns discards any lifecycle_stage / probation_until
--     / ended_reason / ended_note values recorded after apply — they exist
--     only in these columns.
--   * Memberships ended through end_engagement_lifecycle_v1 STAY ended:
--     that state change went through the canonical end_org_membership_v1
--     path (status='ended' + audit_logs row), which this rollback does not
--     and must not undo — a rollback never silently re-grants revoked
--     authority.

begin;

drop trigger if exists engagement_lifecycle_events_append_only on public.engagement_lifecycle_events;

drop function if exists public.end_engagement_lifecycle_v1(text, text, text);
drop function if exists public.set_engagement_lifecycle_stage_v1(text, text, text, text);
drop function if exists public.cancel_offboarding_run_v1(text, text);
drop function if exists public.complete_offboarding_run_v1(text);
drop function if exists public.set_offboarding_item_status_v1(text, text, text);
drop function if exists public.start_offboarding_run_v1(text, jsonb);
drop function if exists public.cancel_onboarding_run_v1(text, text);
drop function if exists public.complete_onboarding_run_v1(text);
drop function if exists public.set_onboarding_item_status_v1(text, text, text, text, text);
drop function if exists public.assign_onboarding_item_v1(text, text);
drop function if exists public.start_onboarding_run_v1(text, text);
drop function if exists public.create_onboarding_template_v1(text, text, text, jsonb);

-- Tables first (their SELECT policies depend on the visibility helpers).
drop table if exists public.offboarding_run_items;
drop table if exists public.offboarding_runs;
drop table if exists public.onboarding_run_items;
drop table if exists public.onboarding_runs;
drop table if exists public.onboarding_template_items;
drop table if exists public.onboarding_templates;
drop table if exists public.engagement_lifecycle_events;

drop function if exists public.can_view_offboarding_run_v1(uuid);
drop function if exists public.can_view_onboarding_run_v1(uuid);
drop function if exists public.can_view_engagement_lifecycle_v1(uuid);
drop function if exists public.engagement_lifecycle_events_guard();

alter table public.engagement_contexts drop column if exists ended_note;
alter table public.engagement_contexts drop column if exists ended_reason;
alter table public.engagement_contexts drop column if exists probation_until;
alter table public.engagement_contexts drop column if exists lifecycle_stage;

commit;
