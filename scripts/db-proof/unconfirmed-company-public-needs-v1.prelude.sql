-- Prelude for the unconfirmed-company-public-needs-v1 proof: Supabase roles,
-- auth.uid()/auth.jwt()/auth.users and the reduced tables and helpers the
-- worker board (20261029190000) and the V-1 migration reference. The helper
-- bodies are the production ones (demand_company_id_v1 = the v2 body of
-- 20261020015000; the synthetic-fixture helpers of 20261028123000);
-- demand_structured_v2_public is reduced to identity (immutable, not under test).
-- ===========================================================================
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create table auth.users (id uuid primary key, email text);
grant usage on schema auth to anon, authenticated, service_role;

create table public.profiles (id uuid primary key, is_admin boolean not null default false);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false) $$;
grant execute on function public.is_admin() to authenticated;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  display_name text, legal_name text, country text,
  contact_email text, contact_phone text,
  verification_status text not null default 'active_unverified',
  created_at timestamptz not null default now()
);
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  display_name text, legal_name text,
  legacy_company_id uuid references public.companies(id)
);
create table public.company_memberships (
  profile_id uuid, organization_id uuid, status text, role text
);
create table public.customer_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id),
  title text not null,
  need_summary text, country text, location text, role_or_work_type text,
  team_size integer, start_period text, notes text,
  kind text, status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customer_requests enable row level security;
create policy customer_requests_select on public.customer_requests for select
  using (profile_id = auth.uid() or public.is_admin());
grant select on public.customer_requests to authenticated;

create table public.company_demand_locations (
  request_id uuid references public.customer_requests(id) on delete cascade,
  city text, location_label text, active boolean not null default true,
  updated_at timestamptz not null default now()
);
create table public.skills (slug text primary key, is_active boolean default true);
create table public.workers (id uuid primary key default gen_random_uuid(), profile_id uuid unique);
grant select on public.workers to authenticated;
create table public.demand_interest_signals (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid, status text, request_id uuid, public_vacancy_id uuid
);
alter table public.demand_interest_signals enable row level security;
grant select, insert on public.demand_interest_signals to authenticated;

create or replace function public.has_org_demand_access(org uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select org is not null and exists (
    select 1 from public.company_memberships m
     where m.profile_id = auth.uid() and m.organization_id = org and m.status = 'active'
       and m.role in ('owner','admin','manager','external_manager')) $$;
revoke all on function public.has_org_demand_access(uuid) from public, anon;
grant execute on function public.has_org_demand_access(uuid) to authenticated;

create or replace function public.demand_company_id_v1(p_organization_id uuid, p_profile_id uuid)
returns uuid language sql stable set search_path to 'public' as $function$
  select case when p_organization_id is not null then
    (select o.legacy_company_id from public.organizations o where o.id = p_organization_id)
  else null end $function$;
revoke all on function public.demand_company_id_v1(uuid, uuid) from public, anon, authenticated;

create or replace function public.is_synthetic_fixture_label_v1(variadic p_values text[])
returns boolean language sql immutable parallel safe set search_path to 'pg_catalog' as $function$
  select coalesce(bool_or(v ~* '\yQA[-_ ]SYNTHETIC\y' or v ~* '\[E2E\]' or v ~* '\yE2E[-_ ]FIXTURE\y'), false)
    from unnest(p_values) as v where v is not null and v <> '' $function$;
create or replace function public.demand_is_synthetic_fixture_v1(p_organization_id uuid, p_profile_id uuid)
returns boolean language sql stable set search_path to 'public' as $function$
  select coalesce((select public.is_synthetic_fixture_label_v1(o.display_name, o.legal_name)
                     from public.organizations o where o.id = p_organization_id), false)
      or coalesce((select public.is_synthetic_fixture_label_v1(c.display_name, c.legal_name)
                     from public.companies c
                    where c.id = public.demand_company_id_v1(p_organization_id, p_profile_id)), false) $function$;
create or replace function public.is_synthetic_viewer_v1() returns boolean
language sql stable set search_path to 'public' as $function$
  select coalesce((auth.jwt() -> 'app_metadata' -> 'qa_synthetic') = 'true'::jsonb, false) $function$;
revoke all on function public.is_synthetic_fixture_label_v1(text[]) from public, anon, authenticated;
revoke all on function public.demand_is_synthetic_fixture_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_synthetic_viewer_v1() from public, anon, authenticated;

create or replace function public.demand_structured_v2_public(p jsonb) returns jsonb
language sql immutable set search_path = public as $$ select p $$;
