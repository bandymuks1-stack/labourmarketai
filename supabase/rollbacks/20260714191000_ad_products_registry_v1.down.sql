-- Rollback for 20260714191000_ad_products_registry_v1.sql (manual, owner-gated).
begin;

drop policy if exists ad_products_select on public.ad_products;
drop table if exists public.ad_products;

commit;
