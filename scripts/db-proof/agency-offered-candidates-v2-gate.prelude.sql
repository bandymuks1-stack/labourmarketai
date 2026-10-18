-- Prelude for the agency-offered-candidates-v2 gate proof. External bits only
-- (Supabase roles, auth.uid(), reduced dependency tables, helper predicates
-- copied from production). agency_* tables, offers columns/status CHECK and the
-- v1/v2 functions come from the REAL migrations.
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
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb; $$;
grant usage on schema auth to anon, authenticated, service_role;

create table public.profiles (id uuid primary key, active_role text);
create table public.profile_roles (profile_id uuid, role text);
create table public.companies (id uuid primary key default gen_random_uuid(), owner_profile_id uuid,
  display_name text, legal_name text, company_type text);
create table public.workers (id uuid primary key default gen_random_uuid(), profile_id uuid);
create table public.customer_requests (id uuid primary key default gen_random_uuid(), profile_id uuid, title text, role_or_work_type text, country text, status text, need_summary text, team_size int, kind text, created_at timestamptz not null default now());
create table public.booking_requests (id uuid primary key default gen_random_uuid(), request_id uuid, worker_id uuid, status text);
create table public.demand_shortlist (id uuid primary key default gen_random_uuid(), request_id uuid, worker_id uuid, owner_id uuid, status text);
create table public.conversations (id uuid primary key default gen_random_uuid(), source_type text, source_id uuid);
create table public.conversation_participants (conversation_id uuid, profile_id uuid);
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid, action text, entity text, entity_id uuid, payload jsonb, created_at timestamptz not null default now());
create table public.company_workers (id uuid primary key default gen_random_uuid(), company_id uuid, worker_id uuid, status text);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create or replace function public.owns_company(c uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.companies x where x.id = c and x.owner_profile_id = auth.uid()); $$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active_role = 'admin')
  or exists (select 1 from public.profile_roles where profile_id = auth.uid() and role = 'admin') $$;
