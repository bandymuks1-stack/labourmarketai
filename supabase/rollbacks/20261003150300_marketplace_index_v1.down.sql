-- Rollback of 20261003150300_marketplace_index_v1.sql
--
-- GUARDED: refuses while anything the migration made possible is in use, so a
-- rollback can never silently destroy a person's data. Remove the offending
-- rows deliberately (owner decision) and re-run.
--
-- v1 RPC signatures were never touched and need no restore.

begin;

do $$
begin
  if exists (
    select 1 from public.marketplace_listings
    where price_amount is not null or currency is not null or quantity is not null
       or unit is not null or expires_at is not null
  ) then
    raise exception 'rollback refused: marketplace_listings holds price_amount/currency/quantity/unit/expires_at data';
  end if;
  if exists (
    select 1 from public.marketplace_listings
    where category not in (
      'accommodation','premises','vehicle','tools','equipment','machinery','safety_equipment')
  ) then
    raise exception 'rollback refused: marketplace_listings uses a subject outside the original 7 categories';
  end if;
  if exists (select 1 from public.marketplace_listings where status = 'paused') then
    raise exception 'rollback refused: marketplace_listings holds status = paused rows';
  end if;
  if exists (
    select 1 from public.service_offerings
    where expires_at is not null or price_amount is not null
       or currency is not null or location_label is not null
  ) then
    raise exception 'rollback refused: service_offerings holds expires_at/price_amount/currency/location_label data';
  end if;
  if exists (
    select 1 from pg_proc
    where proname = 'get_public_business_listings_v1' and prosrc like '%expires_at%'
  ) then
    raise exception 'rollback refused: roll back 20261003150400 (public business expiry) first';
  end if;
end $$;

-- discovery view + policy hook + v2 RPCs + backstop trigger
drop view if exists public.market_index_v1;
drop trigger if exists marketplace_listings_publish_guard_trg on public.marketplace_listings;
drop function if exists public.marketplace_listings_publish_guard();
drop function if exists public.set_marketplace_listing_status_v2(uuid, text);
drop function if exists public.update_marketplace_listing_v2(uuid, text, text, text, text, text, text, text, numeric, text, numeric, text, timestamptz);
drop function if exists public.create_marketplace_listing_v2(text, text, text, text, text, text, text, uuid, uuid, numeric, text, numeric, text, timestamptz);
drop function if exists public.market_publish_policy_v1(uuid, uuid, text, text, text);

-- policies back to their previous predicates
drop policy if exists service_offerings_discover_active on public.service_offerings;
create policy service_offerings_discover_active on public.service_offerings
  for select to authenticated
  using (status = 'active');

drop policy if exists marketplace_listings_select on public.marketplace_listings;
create policy marketplace_listings_select on public.marketplace_listings
  for select using (
    status = 'active' or owner_id = auth.uid() or public.is_admin());

-- service_offerings: new columns (guarded empty above)
alter table public.service_offerings drop constraint if exists service_offerings_price_needs_currency;
alter table public.service_offerings
  drop column if exists expires_at,
  drop column if exists price_amount,
  drop column if exists currency,
  drop column if exists location_label;

-- marketplace_listings: constraints back to the original closed lists
alter table public.marketplace_listings drop constraint if exists marketplace_listings_price_needs_currency;
alter table public.marketplace_listings
  drop column if exists price_amount,
  drop column if exists currency,
  drop column if exists quantity,
  drop column if exists unit,
  drop column if exists expires_at;

alter table public.marketplace_listings drop constraint if exists marketplace_listings_category_fmt;
alter table public.marketplace_listings
  add constraint marketplace_listings_category_check
    check (category in (
      'accommodation','premises','vehicle','tools','equipment','machinery','safety_equipment'));

alter table public.marketplace_listings drop constraint if exists marketplace_listings_status_check;
alter table public.marketplace_listings
  add constraint marketplace_listings_status_check
    check (status in ('draft','active','closed'));

-- registry
drop table if exists public.market_subject_types;

commit;
