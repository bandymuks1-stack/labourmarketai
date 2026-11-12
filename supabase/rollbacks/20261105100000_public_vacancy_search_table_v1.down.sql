-- Rollback of 20261105100000_public_vacancy_search_table_v1. Apply the function rollback first if v6 is live; v5 does not read this table.
-- The table is a derived copy, so dropping it loses nothing: public_vacancies is the source and is not touched.
drop trigger if exists public_vacancy_search_sync_ins on public.public_vacancies;
drop trigger if exists public_vacancy_search_sync_del on public.public_vacancies;
drop trigger if exists public_vacancy_search_sync_upd on public.public_vacancies;
drop function if exists public.public_vacancy_search_sync();
drop table if exists public.public_vacancy_search;
drop function if exists public.public_vacancy_search_fold(text);
