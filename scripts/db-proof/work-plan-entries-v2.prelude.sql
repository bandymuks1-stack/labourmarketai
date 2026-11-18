-- Prelude for the work_plan_entries_v2 proof: Supabase roles/auth.uid + the reduced external tables the
-- migration touches (column sets verified against production information_schema 2026-10-03) +
-- manages_organization copied from the work-tasks prelude (production predicate).
-- work_objects is NOT stubbed: the real migration 20260817150000 creates it.
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
create table public.profile_roles (profile_id uuid references public.profiles(id), role text);
create table public.companies (id uuid primary key, owner_profile_id uuid);          -- prod: NO organization_id column
create table public.agencies (id uuid primary key);                                   -- prod: NO organization_id column
create table public.organizations (id uuid primary key, legacy_company_id uuid, legacy_agency_id uuid);
create table public.workers (id uuid primary key default gen_random_uuid(), profile_id uuid references public.profiles(id));
create table public.engagement_contexts (
  id uuid primary key default gen_random_uuid(), profile_id uuid, organization_id uuid, status text, relationship_slug text);
create table public.company_memberships (
  id uuid primary key default gen_random_uuid(), profile_id uuid references public.profiles(id),
  organization_id uuid references public.organizations(id), status text, role text);
create table public.company_worker_engagements (
  id uuid primary key default gen_random_uuid(), company_id uuid references public.companies(id),
  worker_id uuid references public.workers(id), status text check (status in ('active','ended')));
create table public.agency_workers (
  agency_id uuid references public.agencies(id), worker_id uuid references public.workers(id),
  status text check (status in ('active','paused','removed')));
create table public.projects (
  id uuid primary key default gen_random_uuid(), company_id uuid references public.companies(id),
  status text, organization_id uuid references public.organizations(id));

create or replace function public.owns_company(c uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.companies x where x.id = c and x.owner_profile_id = auth.uid()); $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active_role = 'admin')
  or exists (select 1 from public.profile_roles where profile_id = auth.uid() and role = 'admin') $$;
create or replace function public.manages_organization(org uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.engagement_contexts ec where ec.profile_id = auth.uid() and ec.organization_id = org
       and ec.status = 'active' and ec.relationship_slug in ('manager','owner','external_manager'))
  or exists (select 1 from public.company_memberships m where m.profile_id = auth.uid() and m.organization_id = org
       and m.status = 'active' and m.role in ('owner','admin','manager','external_manager')) $$;
create or replace function public.has_org_demand_access(org uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.company_memberships m where m.profile_id = auth.uid() and m.organization_id = org
    and m.status = 'active' and m.role in ('owner','admin','manager','external_manager')) $$;
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create or replace function public.caller_manages_worker(w uuid) returns boolean language sql stable security definer set search_path to 'public' as $$ select false $$;
grant select on public.profiles, public.workers, public.company_memberships, public.projects, public.organizations,
  public.engagement_contexts to authenticated;
