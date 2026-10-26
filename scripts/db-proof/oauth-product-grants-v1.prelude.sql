-- ============================================================================
-- B3 — oauth_product_grants_v1: PROOF HARNESS PRELUDE (throwaway PG16 only).
--
-- Builds the minimum faithful prerequisites so the REAL files
--   supabase/migrations/20261026080400_oauth_product_grants_v1.sql
--   supabase/rollbacks/20261026080400_oauth_product_grants_v1.down.sql
-- run VERBATIM. Nothing here re-implements them.
--
-- STUBS (documented, deliberately minimal):
--   * roles anon / authenticated / service_role (NOLOGIN), as on Supabase.
--   * role `supa_postgres` (NOSUPERUSER, not BYPASSRLS) owns every public
--     object and runs the migration — like Supabase's `postgres`, which owns
--     public objects but is not a superuser. Definer functions therefore
--     bypass RLS only as table OWNER (relforcerowsecurity false), exactly as
--     in production.
--   * auth.uid() / auth.jwt(): Supabase's own definitions — they read the
--     `request.jwt.claim(s)` GUC that PostgREST sets per request.
--   * auth.users, auth.oauth_clients, auth.oauth_consents,
--     auth.oauth_authorizations: the columns and the
--     auth.oauth_authorization_status enum as read from production's catalog
--     (information_schema, 2026-10-26, metadata only — no rows read). Only
--     the columns the migration touches are kept. supa_postgres gets SELECT
--     on them (production: has_table_privilege('postgres', …,'select') = true).
--   * public.profiles (id only), public.audit_logs (0001 shape + the
--     20261023132610 immutability trigger, without its bypass helper),
--     public.privacy_erasure_registry_v3 (columns the insert names + its
--     unique key).
--
-- Production runs PostgreSQL 17; this proof runs 16. Nothing in the migration
-- uses a 17-only feature.
-- ============================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon')          then create role anon nologin;          end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')  then create role service_role nologin;  end if;
  if not exists (select 1 from pg_roles where rolname = 'supa_postgres') then create role supa_postgres nologin nosuperuser nobypassrls; end if;
end $$;

-- Supabase leaves CREATE on public to its owner role; anon/authenticated get USAGE.
grant usage, create on schema public to supa_postgres;
grant usage on schema public to authenticated, anon, service_role;

create schema if not exists auth;
grant usage on schema auth to authenticated, anon, service_role, supa_postgres;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.jwt(), auth.uid() to authenticated, anon, service_role, supa_postgres;

create table auth.users (id uuid primary key);

create type auth.oauth_authorization_status as enum ('pending', 'approved', 'denied', 'expired');

create table auth.oauth_clients (
  id          uuid primary key,
  client_name text,
  deleted_at  timestamptz
);

create table auth.oauth_consents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  client_id  uuid not null references auth.oauth_clients(id) on delete cascade,
  scopes     text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, client_id)
);

create table auth.oauth_authorizations (
  id               uuid primary key default gen_random_uuid(),
  authorization_id text not null unique,
  client_id        uuid not null references auth.oauth_clients(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete cascade,
  redirect_uri     text not null,
  scope            text not null,
  status           auth.oauth_authorization_status not null default 'pending',
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '10 minutes'
);

grant select on auth.users, auth.oauth_clients, auth.oauth_consents, auth.oauth_authorizations to supa_postgres;
grant references on auth.users to supa_postgres;  -- profiles.id → auth.users(id), as in production

set role supa_postgres;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);

create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text,
  entity      text,
  entity_id   uuid,
  payload     jsonb,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs for select using (false);
create policy audit_logs_insert on public.audit_logs for insert with check (false);
grant select, insert on public.audit_logs to authenticated;

create or replace function public.audit_logs_immutable_guard_v1() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'audit_log_immutable: % is never permitted', tg_op using errcode = '42501';
end $$;
create trigger audit_logs_immutable_guard_v1 before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable_guard_v1();

create table public.privacy_erasure_registry_v3 (
  schema_name      text not null,
  table_name       text not null,
  column_name      text not null,
  parent           text,
  fk_rule_expected text,
  treatment        text,
  decided_by       text,
  legal_review     boolean,
  legal_basis      text,
  note             text,
  primary key (schema_name, table_name, column_name)
);

reset role;
