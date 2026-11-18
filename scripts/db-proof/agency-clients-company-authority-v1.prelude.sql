-- Prelude for the agency-clients company-authority proof. External bits only:
-- Supabase roles, auth.uid(), reduced tables, and owns_company /
-- company_acts_as_agency / is_admin copied from production 2026-11-03.
-- agency_clients, the demand link column, the RLS policy and the three write
-- commands come from the REAL migrations (20260713160000 pre-image, forward).
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
grant usage on schema auth to anon, authenticated;

create table public.profiles (id uuid primary key, active_role text);
create table public.profile_roles (profile_id uuid, role text);
create table public.companies (id uuid primary key, profile_id uuid, company_type text, created_at timestamptz not null default now());
create table public.organizations (id uuid primary key, legacy_company_id uuid);
create table public.organization_roles (organization_id uuid, role_slug text);
create table public.company_memberships (organization_id uuid, profile_id uuid, status text, role text, accepted_at timestamptz);
create table public.customer_requests (id uuid primary key, profile_id uuid, updated_at timestamptz);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active_role = 'admin')
  or exists (select 1 from public.profile_roles where profile_id = auth.uid() and role = 'admin') $$;

create or replace function public.owns_company(c uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.companies x
     where x.id = c and x.profile_id = auth.uid()
       and not exists (
         select 1 from public.organizations o
           join public.company_memberships r on r.organization_id = o.id
          where o.legacy_company_id = c and r.profile_id = auth.uid()
            and r.status = 'revoked' and r.accepted_at is not null
            and not exists (select 1 from public.company_memberships l
                             where l.organization_id = o.id and l.profile_id = auth.uid() and l.status = 'active')))
  or exists (
    select 1 from public.organizations o
      join public.company_memberships m on m.organization_id = o.id
     where o.legacy_company_id = c and m.profile_id = auth.uid()
       and m.status = 'active' and m.role in ('owner', 'admin')) $$;

create or replace function public.company_acts_as_agency(p_company_id uuid) returns boolean
language sql stable set search_path to 'public' as $$
  select exists (select 1 from public.companies c where c.id = p_company_id and c.company_type = 'staffing_agency')
      or exists (select 1 from public.organizations o join public.organization_roles r on r.organization_id = o.id
                  where o.legacy_company_id = p_company_id
                    and r.role_slug in ('workforce_provider', 'talent_provider', 'recruitment_partner')); $$;
revoke all on function public.company_acts_as_agency(uuid) from public, anon;
