-- Rollback for 20260716121000_team_enquiries_v1.sql — drops ONLY what that
-- migration created. ROLLBACK-CHAIN RULE: the migration recreated NO existing
-- function/trigger, so nothing is restored here — only the new objects are
-- removed. Apply manually via Supabase MCP after owner approval, never
-- `db push`.
--
-- ORDER: roll THIS back BEFORE 20260716120000_team_profile_details_v1 (the
-- employer read model here projects team_details at call time).
--
-- NOTE: dropping the tables removes enquiry rows and their event ledger.
-- This is a deliberate owner decision when rolling back — the audit_logs
-- rows written per state change are append-only truth and are NOT deleted.

begin;

drop function if exists public.list_team_enquiries_for_my_teams_v1();
drop function if exists public.list_my_team_enquiries_v1();
drop function if exists public.expire_stale_team_enquiries_v1(integer);
drop function if exists public.withdraw_team_enquiry_v1(uuid);
drop function if exists public.respond_team_enquiry_v1(uuid, text);
drop function if exists public.propose_team_enquiry_v1(uuid, text, date, date, uuid);

drop policy if exists team_enquiry_events_select on public.team_enquiry_events;
drop policy if exists team_enquiries_select on public.team_enquiries;

drop table if exists public.team_enquiry_events;
drop table if exists public.team_enquiries;

commit;
