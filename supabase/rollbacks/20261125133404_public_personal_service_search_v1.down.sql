-- RED DRAFT rollback. NOT APPLIED. Preserves every service offering and its
-- publication choice; revokes the new public read surface without deleting data.
begin;
drop function if exists public.get_public_service_offering_v1(uuid);
drop function if exists public.search_public_service_offerings_v1(text, text, text, integer, integer, uuid);
drop index if exists public.service_offerings_public_created_idx;
-- Keep public_search_enabled rather than discard the owner's recorded choice.
-- With both readers removed no anonymous route can use it.
commit;
