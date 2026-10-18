-- Rollback of 20261003151400: restore the original ACL of the three v1 write
-- RPCs (EXECUTE for authenticated, as set by 20260718210000). Run this only if
-- the app no longer calls v2, i.e. never while the v2 app is deployed.

begin;

grant execute on function public.create_marketplace_listing_v1(text, text, text, text, text, text, text, uuid, uuid) to authenticated;
grant execute on function public.update_marketplace_listing_v1(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.set_marketplace_listing_status_v1(uuid, text) to authenticated;

commit;
