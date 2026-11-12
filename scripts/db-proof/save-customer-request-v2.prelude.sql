-- Prelude for the save_customer_request_v2 proof. External bits only:
-- Supabase roles, auth.uid(), the two tables 0028 references, is_admin, and
-- the two columns 20260530150000 added. customer_requests itself and the v1
-- RPC come from the REAL 0028 migration; v2 from the forward migration.
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
create table public.profiles (id uuid primary key);
create table public.customers (id uuid primary key default gen_random_uuid(), profile_id uuid);
create or replace function public.is_admin() returns boolean language sql stable as $$ select false $$;
