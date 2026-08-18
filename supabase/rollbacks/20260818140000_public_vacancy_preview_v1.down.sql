-- Rollback for 20260818140000_public_vacancy_preview_v1.sql
--
-- Drops exactly the three read-only projection functions. Deletes NO row and
-- touches NO policy: the migration created no table, column, policy, trigger or
-- index, and `public_vacancies` RLS was never modified, so removing these
-- functions simply closes the anonymous path again.

drop function if exists public.search_public_vacancy_previews_v1(text, text, integer, integer);
drop function if exists public.get_public_vacancy_preview_v1(uuid);
drop function if exists public.count_public_vacancies_v1();
