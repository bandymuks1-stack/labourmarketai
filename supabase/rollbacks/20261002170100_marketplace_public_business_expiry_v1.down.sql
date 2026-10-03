-- Rollback of 20261002170100: restore the original get_public_business_listings_v1
-- body (no expiry predicate). Signature and ACL are unchanged either way.
-- Run this BEFORE rolling back 20261002170000 (which drops expires_at).

begin;

create or replace function public.get_public_business_listings_v1(p_org_id uuid)
returns table (
  id uuid,
  listing_kind text,
  category text,
  title text,
  description text,
  location_country text,
  location_label text,
  price_text text
) language sql security definer set search_path = public stable as $$
  select m.id, m.listing_kind, m.category, m.title, m.description,
         m.location_country, m.location_label, m.price_text
  from public.marketplace_listings m
  join public.organizations o on o.id = m.organization_id
  where o.id = p_org_id
    and o.public_profile_enabled = true
    and m.status = 'active'
  order by m.updated_at desc
  limit 50;
$$;

commit;
