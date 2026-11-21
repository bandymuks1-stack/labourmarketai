-- DOWN for 20261023161500_listing_purchases_v1.sql
--
-- GUARDED: refuses while any purchase row exists, so a rollback can never
-- silently destroy a buyer's or a seller's record. Removing rows is a
-- deliberate owner decision, made before re-running this file.
begin;

do $$
begin
  if to_regclass('public.listing_purchases') is not null
     and exists (select 1 from public.listing_purchases) then
    raise exception 'rollback refused: listing_purchases holds rows';
  end if;
end $$;

do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is not null then
    delete from public.privacy_erasure_registry_v3
     where schema_name = 'public' and table_name = 'listing_purchases'
       and column_name in ('buyer_id', 'seller_id');
  end if;
end $$;

drop function if exists public.transition_listing_purchase_v1(uuid, text, text, text);
drop function if exists public.request_listing_purchase_v1(uuid, numeric, text, text, text, text, date, uuid);
drop policy if exists listing_purchases_select on public.listing_purchases;
drop table if exists public.listing_purchases;

commit;
