-- Faithful minimal harness for the MKT-3 single-open-assignment proof.
--
-- Creates ONLY what the real migrations need in order to run VERBATIM:
--   * roles `authenticated` / `anon` (the migrations GRANT to them)
--   * an `auth.uid()` shim reading `app.uid`, the same device every other
--     db-proof in this directory uses
--   * the canonical spine the assets tables reference — profiles, workers,
--     organizations, projects
--   * `manages_organization()` / `is_admin()`, the two authority predicates
--     20260718170000 is written against
--
-- Nothing here re-implements assets, asset_assignments or any lifecycle RPC.
-- Those come from the real files:
--   supabase/migrations/20260718170000_assets_logistics.sql
--   supabase/migrations/20260718180000_assets_rls_recursion_fix.sql
--   supabase/migrations/20260914120000_asset_single_open_assignment_v1.sql
--
-- SCOPE NOTE, so the evidence is not over-read: the proof runs as the cluster
-- superuser, so RLS is bypassed. That is deliberate — this measures the
-- CONCURRENCY and CONSISTENCY property, which is what MKT-3 changes. RLS is
-- untouched by 20260914120000 and is covered by its own proofs.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;

create table public.profiles (
  id uuid primary key,
  display_name text
);

create table public.organizations (
  id uuid primary key,
  display_name text
);

create table public.workers (
  id uuid primary key,
  profile_id uuid references public.profiles(id),
  display_name text
);

create table public.projects (
  id uuid primary key,
  title text
);

-- Who manages an organization. The real predicate reads engagement_contexts;
-- the shape that matters to the assets RPCs is "does the caller manage org X",
-- so the harness models exactly that and nothing else.
create table public.org_managers (
  organization_id uuid not null references public.organizations(id),
  profile_id uuid not null references public.profiles(id),
  primary key (organization_id, profile_id)
);

create or replace function public.manages_organization(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_managers m
     where m.organization_id = org and m.profile_id = auth.uid()
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select false;
$$;
