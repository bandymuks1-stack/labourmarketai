-- Rollback for 20260719120000_business_public_profile.sql
-- Brand-new objects + additive columns only; nothing else depends on them.

drop function if exists public.get_public_business_listings_v1(uuid);
drop function if exists public.get_public_business_services_v1(uuid);
drop function if exists public.get_public_business_profile_v1(text);
drop function if exists public.set_business_public_profile_v1(uuid, boolean, text, text, text, text);

alter table public.organizations drop constraint if exists organizations_public_profile_fields_chk;
drop index if exists public.organizations_public_slug_key;

alter table public.organizations
  drop column if exists public_contact_phone,
  drop column if exists public_contact_email,
  drop column if exists public_tagline,
  drop column if exists public_slug,
  drop column if exists public_profile_enabled;
