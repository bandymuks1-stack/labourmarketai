-- Rollback for 20261011090000_public_vacancy_occupation_trgm_idx_v1.
-- Drops only the index. pg_trgm is left installed: dropping an extension other
-- objects may come to depend on is not a safe rollback step.
drop index if exists public.public_vacancies_active_occupation_trgm_idx;
