-- Prelude for marketplace-index-v1 proof: Supabase roles + auth.uid + reduced externals.
set check_function_bodies = off;
-- marketplace_listings / service_offerings / policies come from the REAL migrations.
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
grant usage on schema auth to anon, authenticated, service_role;

create table public.profiles (id uuid primary key, active_role text);
create table public.organizations (id uuid primary key, public_profile_enabled boolean not null default false);
create table public.projects (id uuid primary key);
create table public.org_members (org_id uuid, profile_id uuid);
create table public.proof_admins (profile_id uuid);
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as
  $$ select exists (select 1 from public.proof_admins where profile_id = auth.uid()) $$;
create function public.manages_organization(p uuid) returns boolean language sql stable security definer set search_path=public as
  $$ select exists (select 1 from public.org_members where org_id = p and profile_id = auth.uid()) $$;
create function public.can_manage_project(p uuid) returns boolean language sql stable security definer set search_path=public as
  $$ select exists (select 1 from public.projects x where x.id = p) and exists (select 1 from public.org_members where profile_id = auth.uid()) $$;
-- Production body of get_public_business_listings_v1 (read from prod 2026-10-03), ACL anon+authenticated.
create or replace function public.get_public_business_listings_v1(p_org_id uuid)
returns table(id uuid, listing_kind text, category text, title text, description text, location_country text, location_label text, price_text text)
language sql stable security definer set search_path to 'public' as $function$
  select m.id, m.listing_kind, m.category, m.title, m.description,
         m.location_country, m.location_label, m.price_text
  from public.marketplace_listings m
  join public.organizations o on o.id = m.organization_id
  where o.id = p_org_id and o.public_profile_enabled = true and m.status = 'active'
  order by m.updated_at desc limit 50;
$function$;
grant execute on function public.get_public_business_listings_v1(uuid) to anon, authenticated;
