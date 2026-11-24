-- @human-gate-approved
-- Wagon 13 slice 2 — public business showcase profiles over canonical organizations.
--
-- Default PRIVATE. A business becomes publicly visible ONLY when an owner/manager
-- opts in (public_profile_enabled = true). No blanket public read of
-- organizations: the owner-scoped RLS on `organizations` is UNCHANGED. Instead a
-- minimal public-read boundary is provided by SECURITY DEFINER functions that
-- return ONLY an allowlisted set of public fields, and ONLY for opted-in orgs.
--
-- Reuse, not duplication: identity/description/country/website come from the
-- canonical `organizations` row; services from canonical `service_offerings`
-- (the owner's ACTIVE offerings); listings from canonical `marketplace_listings`
-- (the org's ACTIVE listings). NO new organization / service / listing store.
-- Private org/worker/project/contact/membership/financial data is never exposed
-- (legal_name, vat_number, owner ids, trust internals, legacy ids are NOT
-- selected). Projects, media, certifications and team members are intentionally
-- omitted — no lawful PUBLIC visibility path exists for them yet (honest gap).
--
-- RED class (SECURITY DEFINER + GRANTs incl. anon for the public reads).
-- Applied under owner standing authorization. Rollback:
-- supabase/rollbacks/20260719120000_business_public_profile.down.sql

alter table public.organizations
  add column if not exists public_profile_enabled boolean not null default false,
  add column if not exists public_slug text,
  add column if not exists public_tagline text,
  add column if not exists public_contact_email text,
  add column if not exists public_contact_phone text;

-- Case-insensitive unique slug, only for rows that set one (partial index).
create unique index if not exists organizations_public_slug_key
  on public.organizations (lower(public_slug)) where public_slug is not null;

alter table public.organizations
  drop constraint if exists organizations_public_profile_fields_chk;
alter table public.organizations
  add constraint organizations_public_profile_fields_chk check (
    (public_slug is null or public_slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$')
    and (public_tagline is null or char_length(public_tagline) <= 160)
    and (public_contact_email is null or char_length(public_contact_email) <= 200)
    and (public_contact_phone is null or char_length(public_contact_phone) <= 40)
  );

-- ── Publication (owner/manager gated) ───────────────────────────────────────
create or replace function public.set_business_public_profile_v1(
  p_org_id uuid,
  p_enabled boolean,
  p_slug text default null,
  p_tagline text default null,
  p_contact_email text default null,
  p_contact_phone text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_slug text;
begin
  -- Owner/manager only (engagement_contexts owner/manager/external_manager),
  -- with an owner_profile_id fallback.
  if not (public.manages_organization(p_org_id)
          or exists (select 1 from public.organizations
                     where id = p_org_id and owner_profile_id = auth.uid()))
  then raise exception 'not authorized'; end if;

  v_slug := nullif(lower(trim(coalesce(p_slug, ''))), '');
  if p_enabled then
    if v_slug is null or v_slug !~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'
      then raise exception 'invalid slug'; end if;
    -- slug uniqueness across other orgs
    if exists (select 1 from public.organizations
               where lower(public_slug) = v_slug and id <> p_org_id)
      then raise exception 'slug taken'; end if;
  end if;

  update public.organizations set
    public_profile_enabled = p_enabled,
    public_slug = coalesce(v_slug, public_slug),
    public_tagline = nullif(left(coalesce(p_tagline, ''), 160), ''),
    public_contact_email = nullif(left(coalesce(p_contact_email, ''), 200), ''),
    public_contact_phone = nullif(left(coalesce(p_contact_phone, ''), 40), ''),
    updated_at = now()
  where id = p_org_id;
end; $$;

-- ── Public reads (allowlisted fields, opted-in orgs only) ────────────────────
create or replace function public.get_public_business_profile_v1(p_slug text)
returns table (
  id uuid,
  display_name text,
  tagline text,
  description text,
  country text,
  website text,
  contact_email text,
  contact_phone text
) language sql security definer set search_path = public stable as $$
  select o.id, o.display_name, o.public_tagline, o.description, o.country, o.website,
         o.public_contact_email, o.public_contact_phone
  from public.organizations o
  where o.public_profile_enabled = true
    and lower(o.public_slug) = lower(p_slug)
  limit 1;
$$;

create or replace function public.get_public_business_services_v1(p_org_id uuid)
returns table (
  id uuid,
  title text,
  description text,
  category_slug text,
  location_country text,
  remote boolean,
  rate_text text
) language sql security definer set search_path = public stable as $$
  select s.id, s.title, s.description, s.category_slug, s.location_country, s.remote, s.rate_text
  from public.service_offerings s
  join public.organizations o on o.owner_profile_id = s.provider_id
  where o.id = p_org_id
    and o.public_profile_enabled = true
    and s.status = 'active'
  order by s.updated_at desc
  limit 50;
$$;

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

-- Public reads are callable by anon (unauthenticated profile page) + authenticated;
-- every one filters public_profile_enabled = true, so nothing private is exposed.
grant execute on function public.get_public_business_profile_v1(text) to anon, authenticated;
grant execute on function public.get_public_business_services_v1(uuid) to anon, authenticated;
grant execute on function public.get_public_business_listings_v1(uuid) to anon, authenticated;
-- Publication write stays authenticated-only (owner/manager re-checked inside).
grant execute on function public.set_business_public_profile_v1(uuid, boolean, text, text, text, text) to authenticated;

-- ROLLBACK: see supabase/rollbacks/20260719120000_business_public_profile.down.sql
