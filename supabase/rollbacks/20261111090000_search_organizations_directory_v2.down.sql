-- Rollback of 20261111090000_search_organizations_directory_v2. v2 is new and only read, so dropping it
-- loses nothing. v1 gets back exactly the grant it held before (authenticated), so the network search's
-- fallback keeps working; the app needs no change.
begin;
drop function if exists public.search_organizations_directory_v2(text);
grant execute on function public.search_organizations_directory_v1(p_term text) to authenticated;
commit;
