-- Rollback for 20261103171200_drop_duplicate_vacancy_published_idx_v1
-- Recreates the index exactly as 20260903070000 defined it, with its comment.
--
-- PRODUCTION: build it without blocking writers — execute_sql, one statement
-- on its own:
--   create index concurrently if not exists public_vacancies_active_published_idx
--     on public.public_vacancies (published_at desc nulls last, id) where is_active;
-- then apply this file (the create is skipped, the comment is set). Check
-- indisvalid = true first; drop and rebuild concurrently if it is not.

begin;

create index if not exists public_vacancies_active_published_idx
  on public.public_vacancies (published_at desc nulls last, id)
  where is_active;

comment on index public.public_vacancies_active_published_idx is
  'Active rows in board order (published_at desc nulls last, id). Serves the public job board default listing and the sitemap projection so both stop at their LIMIT instead of sorting the whole active set (P0-1, 2026-09-03).';

commit;
