-- RED DRAFT rollback. NOT APPLIED. Preserves every service offering and its
-- publication choice and accumulated audit history; revokes the new public read
-- surface and future history appends without deleting data. No backfill on reapply.
begin;

drop trigger if exists service_offering_history_v1 on public.service_offerings;
drop function if exists public.service_offering_history_v1();
drop function if exists public.get_public_service_offering_v1(uuid);
drop function if exists public.search_public_service_offerings_v1(text, text, text, integer, integer, uuid);
drop index if exists public.service_offerings_public_created_idx;
-- Keep public_search_enabled rather than discard the owner's recorded choice.
-- With both readers removed no anonymous route can use it.
commit;
