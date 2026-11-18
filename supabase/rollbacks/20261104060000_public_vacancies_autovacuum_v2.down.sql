-- Rollback for 20261104060000_public_vacancies_autovacuum_v2
-- Safe: restores the 20260903110000 storage parameters (2 % + 500) and drops the
-- insert thresholds back to the server defaults. No data is touched.

alter table public.public_vacancies set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 500
);

alter table public.public_vacancies reset (
  autovacuum_vacuum_insert_scale_factor,
  autovacuum_vacuum_insert_threshold
);

comment on table public.public_vacancies is
  'Imported public vacancies (market data). Autovacuum thresholds lowered to 2 % / 500 rows (2026-09-03) so the nightly importer''s row updates are vacuumed promptly and the covering index for count_public_vacancies_v1 stays index-only (P0-1).';
