-- Rollback for 20261103200100_public_vacancies_occupation_trgm_idx_v2
-- PRODUCTION: run on its own, without BEGIN, so writers are not blocked:
--   drop index concurrently if exists public.public_vacancies_occupation_trgm_idx;
-- then apply this file as the recorded no-op. Leaves pg_trgm installed.

begin;

drop index if exists public.public_vacancies_occupation_trgm_idx;

commit;
