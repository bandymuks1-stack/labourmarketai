-- Rollback for 20260716120000_team_profile_details_v1.sql — drops ONLY what
-- that migration created. ROLLBACK-CHAIN RULE: the migration recreated NO
-- existing function/trigger, so nothing is restored here — only the new
-- objects are removed. Apply manually via Supabase MCP after owner approval,
-- never `db push`.
--
-- ORDER: if 20260716121000_team_enquiries_v1 was applied, roll THAT back
-- first (its read model projects this table at call time).
--
-- NOTE: dropping the table removes any saved team details rows. This is a
-- deliberate owner decision when rolling back — the audit_logs rows written
-- by saves are append-only truth and are NOT deleted.

begin;

drop function if exists public.save_team_details_v1(uuid, text, date, boolean, boolean, integer, text);
drop policy if exists team_details_select on public.team_details;
drop table if exists public.team_details;

commit;
