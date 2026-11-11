-- Rollback of 20261111090000_search_organizations_directory_v2. The function is new and only read,
-- so dropping it loses nothing; v1 is untouched by both files.
begin;
drop function if exists public.search_organizations_directory_v2(text);
commit;
