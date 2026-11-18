-- Rollback for 20261103171100_public_vacancies_occupation_trgm_idx_v1
-- Drops ONLY the trigram index. Derived structure: no data impact; the job
-- search falls back to the covering-index scan it used before.
--
-- PRODUCTION: run WITHOUT this file's transaction so writers are never
-- blocked — execute_sql, one statement on its own:
--   drop index concurrently if exists public.public_vacancies_occupation_trgm_idx;
-- The transactional form below is for local / preview databases (it takes an
-- ACCESS EXCLUSIVE lock for the few milliseconds the drop needs).

begin;

drop index if exists public.public_vacancies_occupation_trgm_idx;

commit;
