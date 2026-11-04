-- 20261104060000_public_vacancies_autovacuum_v2
--
-- Cold first /jobs text search — why it still takes seconds, and the smallest fix.
--
-- 20260903110000 set 2 % + 500 so that "a vacuum follows each import (≈1.5k
-- dead tuples)". That was 2 % of 72k rows. The table now holds 192k rows, so the
-- same setting waits for ≈4.3k dead tuples, and inserts never trigger a vacuum at
-- all (server default: 1,000 + 20 % ≈ 39k inserts). Between vacuums the
-- visibility map goes stale and the "index-only" count fetches the heap.
--
-- Measured on production 2026-11-04 (read-only):
--   * last_autovacuum 2026-11-02 09:25 (44 h), relallvisible 17,434 of 24,411.
--   * free-text count: Index Only Scan public_vacancies_active_board_cover_idx
--     (3,282 pages) with Heap Fetches 36,064 -> shared hit=29,282.
--   * time follows pages touched, not the plan: the same plan answered in
--     0.10-0.15 s once its pages were resident and in 2.4-8.8 s (worst 24 s while
--     the instance was memory-starved) when they were not. A 2,690-page count
--     took 2.66 s in that same state. CPU was not the limit (1M-row
--     generate_series: 285 ms).
-- Measured on a production-width synthetic copy (PG16, 23.8k heap pages):
--   * after two days of importer churn: Seq Scan, 25,401 pages per count
--   * after VACUUM:                     Index Only Scan, 2,028-2,095 pages
--   * totals and the md5 of the top-20 ids are identical before and after for
--     a, el, ter, ing, are, kock, snickare, undersköterska, montör, zzqx.
--   * one NAV-sized import (1,600 updates + 900 inserts) already costs the count
--     21,809 heap fetches. Thresholds of 1,500 / 1,000 did NOT fire (HOT pruning
--     left n_dead_tup at 1,346); 200 / 200 fired within ~40 s and brought the
--     count back to 2,183 pages, 0 heap fetches.
--
-- This restores the 2026-09-03 intent ("a vacuum follows each import") with
-- absolute thresholds that do not drift as the table grows: a vacuum after 200
-- dead tuples or 200 inserts. Autovacuum visits a table at most once per naptime
-- (1 min) and skips index vacuuming when few pages hold dead items, so a vacuum
-- between imports reads little more than the pages the import changed.
-- Storage parameters only — no data, no privileges, no function, no index, no
-- result change. The analyze settings of v1 are kept. Reversible: see the ROLLBACK block and
-- supabase/rollbacks/<same name>.down.sql.

alter table public.public_vacancies set (
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_vacuum_threshold = 200,
  autovacuum_vacuum_insert_scale_factor = 0,
  autovacuum_vacuum_insert_threshold = 200
);

comment on table public.public_vacancies is
  'Imported public vacancies (market data). Autovacuum after 200 dead tuples or 200 inserts, absolute (2026-11-04, v2 of 2026-09-03), so each import is vacuumed promptly and the covering indexes used by search and count stay index-only.';

-- ROLLBACK
-- alter table public.public_vacancies set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 500);
-- alter table public.public_vacancies reset (autovacuum_vacuum_insert_scale_factor, autovacuum_vacuum_insert_threshold);
