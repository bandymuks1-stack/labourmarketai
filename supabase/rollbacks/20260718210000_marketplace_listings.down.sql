-- Rollback for 20260718210000_marketplace_listings.sql
-- Brand-new objects only; nothing else depends on them. Reversible.

drop function if exists public.delete_marketplace_listing_v1(uuid);
drop function if exists public.set_marketplace_listing_status_v1(uuid, text);
drop function if exists public.update_marketplace_listing_v1(uuid, text, text, text, text, text, text, text);
drop function if exists public.create_marketplace_listing_v1(text, text, text, text, text, text, text, uuid, uuid);

drop table if exists public.marketplace_listings cascade;
