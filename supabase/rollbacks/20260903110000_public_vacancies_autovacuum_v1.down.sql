-- Rollback for 20260903110000_public_vacancies_autovacuum_v1
-- Safe: resets the per-table autovacuum storage parameters to the server
-- defaults. No data is touched.

alter table public.public_vacancies reset (
  autovacuum_vacuum_scale_factor,
  autovacuum_vacuum_threshold,
  autovacuum_analyze_scale_factor,
  autovacuum_analyze_threshold
);
