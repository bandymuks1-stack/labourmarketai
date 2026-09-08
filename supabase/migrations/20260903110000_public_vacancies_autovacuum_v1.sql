-- 20260903110000_public_vacancies_autovacuum_v1
--
-- P0-1, third GREEN step — why the covering index alone was still slow.
--
-- Measured on production 2026-09-03 after 20260903090000 was applied:
--   * count body, warm: Index Only Scan on public_vacancies_active_supply_cover_idx
--     but **Heap Fetches: 26,098** (shared hit=20,956) → 875 ms warm, seconds
--     cold; /jobs-sitemap.xml still 503 on a cold call.
--   * pg_stat_user_tables: last_autovacuum = 2026-08-28, n_dead_tup = 3,632,
--     n_mod_since_analyze = 4,005. The nightly importer UPDATEs every active
--     row (last_seen_at), which clears the visibility-map bits for the pages
--     it touches, but the dead-tuple count never reaches the default
--     autovacuum threshold (20 % of 72k ≈ 14.5k), so no vacuum ran for six
--     days and every "index-only" scan fetched the heap anyway.
--   * one manual VACUUM (ANALYZE): Heap Fetches 0, shared hit=523, 618 ms
--     warm; /jobs-sitemap.xml cold → 200 in 1.86 s.
--
-- This sets per-table autovacuum thresholds so a vacuum follows each import
-- (≈1.5k dead tuples) and the visibility map stays fresh. Storage parameters
-- only — no data, no privileges, no function change. Reversible: see the
-- ROLLBACK block and supabase/rollbacks/<same name>.down.sql.

alter table public.public_vacancies set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 500,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold = 500
);

comment on table public.public_vacancies is
  'Imported public vacancies (market data). Autovacuum thresholds lowered to 2 % / 500 rows (2026-09-03) so the nightly importer''s row updates are vacuumed promptly and the covering index for count_public_vacancies_v1 stays index-only (P0-1).';

-- ROLLBACK
-- alter table public.public_vacancies reset (autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold, autovacuum_analyze_scale_factor, autovacuum_analyze_threshold);
