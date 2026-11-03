-- @human-gate-approved — RED draft (ALTER FUNCTION on a SECURITY DEFINER function). NOT applied. Apply only after explicit owner approval, BEFORE 20261103200100.
-- 20261103200000_search_public_vacancy_previews_force_custom_plan_v1
--
-- One function setting, nothing else: no body, signature, grant, policy,
-- column or row changes. The search stays exactly as precise as today.
--
-- WHY (production, 2026-11-03, ledger 20261103193911 -> rollback 20261103194208):
-- with the trigram index present, plpgsql switched the nested statements to a
-- GENERIC plan after the first executions. A generic plan does not see the
-- search term, so it chose the trigram index even for 1-2 character terms,
-- which have no trigrams: 'a' 25,988 ms, 'el' 16,371 ms against a 3 s timeout.
-- A custom plan sees the term; pg_trgm's cost estimate then rejects the index
-- for a term without trigrams and the planner keeps today's scan.
--
-- SCRATCH (PG16, synthetic production-shaped copy, trigram index present,
-- pass 2 ms / shared buffers per function call, session plan_cache_mode forced):
--   term            today, generic     today, custom     with this, generic
--   a               341 / 10,104       81 / 5,086        91 / 5,086
--   el              314 / 10,104       94 / 5,319        75 / 5,319
--   kock              3 / 240           9 / 3,558         6 / 3,558
-- With this setting, every term under a forced generic, forced custom or auto
-- session gets the same plan as forced custom; totals and top-20 ids were
-- identical for 9 terms in all 9 variant x mode runs.
-- Cost: each call re-plans its two statements (sub-millisecond).
--
-- NOTE: CREATE OR REPLACE FUNCTION resets this setting. Any later replace
-- must carry `set plan_cache_mode to 'force_custom_plan'`; the guard
-- jobs-search-custom-plan-v1.test.ts fails otherwise.

begin;

alter function public.search_public_vacancy_previews_v1(text, text, integer, integer)
  set plan_cache_mode = force_custom_plan;

commit;

-- ROLLBACK
-- see supabase/rollbacks/20261103200000_search_public_vacancy_previews_force_custom_plan_v1.down.sql
