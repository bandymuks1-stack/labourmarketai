-- Prelude for the RED-1 service-request → proposal link proof. External bits
-- only: Supabase roles, auth.uid(), reduced profiles / customer_requests /
-- projects, is_admin. service_offerings, service_offering_requests, proposals,
-- contracts and every RPC come from the REAL migrations.
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
create table public.customer_requests (id uuid primary key, profile_id uuid);
create table public.projects (id uuid primary key);
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active_role = 'admin') $$;
