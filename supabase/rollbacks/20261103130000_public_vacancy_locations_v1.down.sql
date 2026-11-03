-- Rollback for 20261103130000_public_vacancy_locations_v1.sql
--
-- Drops the one function the migration added. Safe and exact: the migration
-- created no table, column, policy, index, trigger or row and did not replace
-- any existing function, so after this DROP the anonymous vacancy boundary is
-- byte-for-byte the 2026-08-24 boundary again (search_public_vacancy_previews_v1,
-- get_public_vacancy_preview_v1, list_public_vacancy_sitemap_v1 and
-- count_public_vacancies_v1 were never touched). The app reader treats the
-- missing function as "not provisioned" and shows no location.
drop function if exists public.public_vacancy_locations_v1(p_ids uuid[]);
