-- Rollback of 20261003151200: drop the capability read function. Nothing else
-- was created or altered by the migration, so no data is touched.
-- The app falls back to "type not stated" for foreign organisations.

begin;

drop function if exists public.org_capabilities_for_visible_listings_v1(uuid[]);

commit;
