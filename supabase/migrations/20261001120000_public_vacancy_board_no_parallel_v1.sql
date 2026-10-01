-- @human-gate-approved
-- 20261001120000_public_vacancy_board_no_parallel_v1
--
-- RED by the migration-safety gate (ALTER FUNCTION on SECURITY DEFINER
-- functions). Config-only: no body, signature, grant, RLS or data change.
-- Existing function settings (search_path, work_mem) are kept; ALTER FUNCTION
-- ... SET adds one more.
--
-- MEASURED 2026-10-01 on production (project gorgitwvdzxbnaxhrsrw):
--   instance: max_parallel_workers = 2, shared_buffers 224 MB.
--   After the covering index (20261001090000) the generic plan of
--   search_public_vacancy_previews_v1 for a LIMIT-20 read became
--   "Gather Merge + Parallel Index Only Scan". The scan itself takes 0.5 ms;
--   launching the parallel worker costs 130-220 ms (Gather Merge actual time
--   138..221 ms), every call, and consumes one of the 2 parallel slots the
--   whole database shares.
--   Same query with max_parallel_workers_per_gather = 0 (EXPLAIN ANALYZE):
--     unfiltered   0.147 ms   (parallel: 228 ms)
--     baker        88 ms cold  (parallel: 26-230 ms)
--   A 20-row ordered read has nothing to parallelise.
--
-- Rollback: supabase/rollbacks/20261001120000_public_vacancy_board_no_parallel_v1.down.sql

alter function public.search_public_vacancy_previews_v1(text, text, integer, integer)
  set max_parallel_workers_per_gather = 0;

alter function public.count_public_vacancies_v1()
  set max_parallel_workers_per_gather = 0;

-- ROLLBACK
-- see supabase/rollbacks/20261001120000_public_vacancy_board_no_parallel_v1.down.sql
