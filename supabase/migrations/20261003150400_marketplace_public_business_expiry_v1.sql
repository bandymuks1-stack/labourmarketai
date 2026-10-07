-- @human-gate-approved
-- ============================================================================
-- DRAFT — needs-human-gate — RED class (SECURITY DEFINER, ANON-REACHABLE).
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
--
-- PUBLIC-SURFACE change, split from 20261003150300_marketplace_index_v1.sql so
-- the gate can review it independently. ONE function body change:
-- get_public_business_listings_v1 gains `and (m.expires_at is null or
-- m.expires_at > now())`. Signature, return type, language, SECURITY DEFINER,
-- search_path and ACL (create or replace preserves it) are UNCHANGED.
--
-- REQUIRES 20261003150300 (the expires_at column). Applied alone it would error
-- at call time, so apply order is 170000 then 170100.
--
-- Is it required for correctness? Only once a listing carries expires_at: until
-- then every row has expires_at null and the result is identical. Without it an
-- expired listing would stay on the public business page of an organisation
-- with a public profile. It can be deferred without breaking anything else, but
-- then expiry is not honoured on the anon surface.
--
-- ROLLBACK: supabase/rollbacks/20261003150400_marketplace_public_business_expiry_v1.down.sql
-- ============================================================================

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
    and (m.expires_at is null or m.expires_at > now())
  order by m.updated_at desc
  limit 50;
$$;

commit;

-- ROLLBACK: see supabase/rollbacks/20261003150400_marketplace_public_business_expiry_v1.down.sql
