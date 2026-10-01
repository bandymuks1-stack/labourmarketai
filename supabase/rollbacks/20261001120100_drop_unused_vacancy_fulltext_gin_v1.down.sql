-- Rollback for 20261001120100_drop_unused_vacancy_fulltext_gin_v1
-- Recreates the index exactly as it was (definition read from pg_indexes
-- 2026-10-01). Build time on 111k rows is a few seconds and blocks writers.

create index if not exists public_vacancies_fulltext_idx
  on public.public_vacancies
  using gin (to_tsvector('simple'::regconfig, ((title_raw || ' '::text) || description_raw)))
  where is_active;
