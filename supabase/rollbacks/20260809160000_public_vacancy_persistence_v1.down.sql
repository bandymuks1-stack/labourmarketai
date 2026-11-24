-- ============================================================================
-- ROLLBACK for 20260809160000_public_vacancy_persistence_v1.sql
--
-- SAFE AT ANY TIME. Both tables hold ONLY re-fetchable public data:
--   * every `public_vacancies` row originated at a public employment service
--     and can be re-imported by running one snapshot channel;
--   * every `vacancy_import_cursors` row is a checkpoint whose loss costs a
--     single re-read, which is precisely the failure mode the cursor design
--     already calls "cheap" (a lost checkpoint costs a re-read, a wrong one
--     costs skipped records).
-- Nothing here is authored on the platform, so nothing here is unrecoverable.
--
-- Dropping the tables removes their policies, indexes and grants with them.
-- ============================================================================

drop table if exists public.vacancy_import_cursors;
drop table if exists public.public_vacancies;
