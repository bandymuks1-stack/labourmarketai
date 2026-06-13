-- ============================================================================
-- ROLLBACK for 20260614120000_ai_runs_suggestions.sql
-- Reversible: both tables are additive and new. Dropping them removes the AI
-- audit log + suggestion store and nothing else (no factual data lives here).
-- Run ONLY via Supabase SQL editor / MCP after owner review.
-- ============================================================================
begin;

drop policy if exists ai_suggestions_owner_update on public.ai_suggestions;
drop policy if exists ai_suggestions_select on public.ai_suggestions;
drop policy if exists ai_runs_select on public.ai_runs;

drop table if exists public.ai_suggestions;
drop table if exists public.ai_runs;

commit;
