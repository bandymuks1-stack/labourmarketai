-- Prelude for the agency-pool-docs-readiness live-roster proof. External bits
-- only: Supabase roles, auth.uid(), reduced tables, and the canonical agency
-- gate (owns_company, company_acts_as_agency, caller_agency_company_id) copied
-- from production 2026-11-03. agency_pool_docs_readiness itself comes from the
-- REAL s6 migration (pre-image) and the REAL forward migration.
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

create table public.companies (id uuid primary key, profile_id uuid, company_type text, created_at timestamptz not null default now());
create table public.organizations (id uuid primary key, legacy_company_id uuid);
create table public.organization_roles (organization_id uuid, role_slug text);
create table public.company_memberships (organization_id uuid, profile_id uuid, status text, role text, accepted_at timestamptz);
create table public.company_workers (company_id uuid, worker_id uuid, status text);
create table public.agencies (id uuid primary key, profile_id uuid);
create table public.agency_workers (agency_id uuid, worker_id uuid, status text);
create table public.workers (id uuid primary key, profile_id uuid);
create table public.worker_documents (id uuid primary key default gen_random_uuid(), worker_id uuid, valid_until timestamptz);
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid, action text, entity text, entity_id uuid, payload jsonb);

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

create or replace function public.caller_agency_company_id() returns uuid
language sql stable security definer set search_path to 'public' as $$
  select c.id from public.companies c
   where auth.uid() is not null
     and (c.profile_id = auth.uid()
          or exists (select 1 from public.organizations o join public.company_memberships m on m.organization_id = o.id
                      where o.legacy_company_id = c.id and m.profile_id = auth.uid() and m.status = 'active'))
     and public.owns_company(c.id)
     and public.company_acts_as_agency(c.id)
   order by c.created_at, c.id
   limit 1 $$;
revoke all on function public.caller_agency_company_id() from public, anon;
grant execute on function public.caller_agency_company_id() to authenticated;
