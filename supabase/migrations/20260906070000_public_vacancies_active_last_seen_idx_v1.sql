-- 20260906070000_public_vacancies_active_last_seen_idx_v1
--
-- Lane H (performance / production hygiene, window 6, 2026-09-06).
--
-- MEASURED on production (pg_stat_statements since 2026-05-19, role
-- `authenticated`): the worker board's supply-freshness read
--
--   select last_seen_at from public.public_vacancies
--    where is_active and (expires_at is null or expires_at > now())
--    order by last_seen_at desc limit 1
--
-- ran 869 times at a MEAN of 270.8 ms and a MAX of 6,747 ms — against the
-- 8 s statement_timeout of the role that renders the board. EXPLAIN
-- (ANALYZE, BUFFERS) 2026-09-06: Index Only Scan over
-- public_vacancies_active_supply_cover_idx (47,426 live rows, 9,595 heap
-- fetches) + top-N heapsort, 279 ms. No index orders the active rows by
-- last_seen_at, so every board render sorts the whole active set to find
-- ONE row.
--
-- This index lets that read walk the newest rows first and stop at the
-- first live one: the same shape as public_vacancies_active_published_idx
-- (P0-1, 2026-09-03), which took the board listing from 2,850 ms to 4.7 ms.
-- `last_seen_at` is NOT NULL, so `desc nulls last` is semantically the
-- plain `desc` the code used; the code now asks for NULLS LAST explicitly
-- (apps/web/lib/vacancy-store/vacancy-read.ts readSupplyLastRefreshedAt) so
-- the planner's pathkeys match the index — the exact trap P0-1 documented.
-- Expected after: < 1 ms (index walk, first row). Verified only by the
-- equivalent EXPLAIN on the published_at twin (0.141 ms); this index is
-- applied by the orchestrator via Supabase MCP `apply_migration`, never by
-- this lane.
--
-- Additive: no row changes, no grants, no RLS change, no function change.
-- Reversible: see the ROLLBACK block and
-- supabase/rollbacks/20260906070000_public_vacancies_active_last_seen_idx_v1.down.sql.

create index if not exists public_vacancies_active_last_seen_idx
  on public.public_vacancies (last_seen_at desc nulls last, id)
  where is_active;

comment on index public.public_vacancies_active_last_seen_idx is
  'Active rows newest-seen first (last_seen_at desc nulls last, id). Serves the board supply-freshness read (readSupplyLastRefreshedAt: order by last_seen_at desc limit 1) so it stops at the first live row instead of sorting the whole active set (measured 270.8 ms mean / 6,747 ms max over 869 calls; Lane H 2026-09-06).';

-- ROLLBACK
-- drop index if exists public.public_vacancies_active_last_seen_idx;
