-- Rollback for 20261103171000_pg_trgm_extension_v1
-- Removes pg_trgm. No CASCADE on purpose: while
-- public.public_vacancies_occupation_trgm_idx exists this refuses, so the
-- index rollback (20261103171100 .down.sql) has to run first and nothing is
-- dropped by surprise. Apply via Supabase MCP apply_migration.

begin;

drop extension if exists pg_trgm;

commit;
