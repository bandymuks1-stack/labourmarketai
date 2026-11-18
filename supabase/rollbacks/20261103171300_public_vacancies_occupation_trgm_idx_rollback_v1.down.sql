-- Rollback for 20261103171300_public_vacancies_occupation_trgm_idx_rollback_v1
-- Undoing the rollback means re-creating the trigram index. DO NOT run it as is: production
-- (2026-11-03) showed 16-26 s searches for 1-2 character terms under generic plans with this
-- index present. Re-create it only together with a fix for that (see the follow-up RED draft).
-- In production, build it on its own, CONCURRENTLY:
--   create index concurrently if not exists public_vacancies_occupation_trgm_idx
--     on public.public_vacancies
--     using gin ((lower(occupation_raw) collate "C") extensions.gin_trgm_ops)
--     where is_active;

create index if not exists public_vacancies_occupation_trgm_idx
  on public.public_vacancies
  using gin ((lower(occupation_raw) collate "C") extensions.gin_trgm_ops)
  where is_active;
