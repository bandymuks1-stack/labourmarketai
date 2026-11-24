-- ============================================================================
-- Evidence-media bucket proof - HARNESS PRELUDE (throwaway Postgres only).
--
-- Minimal faithful prerequisites so the REAL files
--   supabase/migrations/20261007100000_evidence_record_media_link_v1.sql
--   supabase/migrations/20261007180000_evidence_media_bucket_v1.sql
-- run VERBATIM. Stubs: auth.uid() / is_admin() read session GUCs; storage.*
-- is the minimum Supabase shape (foldername = path segments before the file);
-- manages_organization = active owner/admin/manager membership (the real
-- function is wider, never narrower for these actors).
-- Never point this at production or a shared local Supabase stack.
-- ============================================================================
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon;          end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role;  end if;
end $$;
grant usage on schema public to authenticated, anon, service_role;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('app.uid', true), '')::uuid; $$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;

create or replace function public.is_admin() returns boolean language sql stable as
$$ select coalesce(nullif(current_setting('app.is_admin', true), ''), 'false')::boolean; $$;
grant execute on function public.is_admin() to authenticated, anon, service_role;

create table public.profiles (id uuid primary key default gen_random_uuid());
create table public.organizations (id uuid primary key default gen_random_uuid(), display_name text);
create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  profile_id uuid not null references public.profiles(id),
  role text not null,
  status text not null default 'active'
);
grant select on public.profiles, public.organizations, public.company_memberships to authenticated;

create or replace function public.manages_organization(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.company_memberships m
                  where m.organization_id = org and m.profile_id = auth.uid()
                    and m.status = 'active' and m.role in ('owner','admin','manager'));
$$;
grant execute on function public.manages_organization(uuid) to authenticated, anon;

create table public.work_objects (id uuid primary key default gen_random_uuid(), organization_id uuid);
create table public.organization_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  linked_profile_id uuid, link_state text not null default 'unlinked',
  unique (id, organization_id)
);
create table public.organization_evidence_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unique (id, organization_id)
);
create or replace function public.is_evidence_record_subject(rec uuid) returns boolean
language sql stable as $$ select false; $$;
grant select on public.work_objects, public.organization_people, public.organization_evidence_records to authenticated;

-- storage (minimum faithful shape)
create schema if not exists storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb
);
create or replace function storage.foldername(name text) returns text[] language plpgsql as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts,1)-1];
end $$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon, service_role;
grant select, insert, update, delete on storage.objects to authenticated, anon;
grant select on storage.buckets to authenticated, anon;
