-- Prelude for commitment-override-receipts-v1 proof (PostgreSQL 16, scratch).
-- Helper functions are VERBATIM from production (read 2026-10-03, SELECT-only):
-- can_manage_project, owns_company, manages_organization, owns_worker, is_admin.
-- project_worker_assignments mirrors production: PK, UNIQUE(project_id, worker_id),
-- status CHECK, both FKs ON DELETE CASCADE, policies pwa_select / pwa_write, ACL
-- postgres=arwdDxtm, authenticated=r. workers.profile_id is UNIQUE (prod).
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase default privileges: new public tables are granted to anon/authenticated/service_role.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated, service_role;

create table public.profiles (id uuid primary key, active_role text);
create table public.profile_roles (profile_id uuid references public.profiles(id), role text);
create table public.organizations (id uuid primary key, legacy_company_id uuid);
create table public.companies (id uuid primary key, profile_id uuid, owner_profile_id uuid);
create table public.workers (id uuid primary key default gen_random_uuid(), profile_id uuid references public.profiles(id));
create unique index workers_profile_id_key on public.workers (profile_id);
create table public.engagement_contexts (id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id), organization_id uuid references public.organizations(id),
  status text, relationship_slug text);
create table public.company_memberships (profile_id uuid references public.profiles(id),
  organization_id uuid references public.organizations(id), status text, role text);
create table public.projects (id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id), organization_id uuid references public.organizations(id),
  status text, start_date date, end_date date);
create table public.project_worker_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  status text not null default 'active' check (status in ('active','ended')),
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (project_id, worker_id)
);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active_role = 'admin')
  or exists (select 1 from public.profile_roles where profile_id = auth.uid() and role = 'admin')
$$;
create or replace function public.owns_worker(w uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.workers x where x.id = w and x.profile_id = auth.uid()
  )
$$;
create or replace function public.owns_company(c uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.companies x where x.id = c and x.profile_id = auth.uid()
  )
  or exists (
    select 1
      from public.organizations o
      join public.company_memberships m on m.organization_id = o.id
     where o.legacy_company_id = c
       and m.profile_id = auth.uid()
       and m.status = 'active'
       and m.role in ('owner', 'admin')
  )
$$;
create or replace function public.manages_organization(org uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = auth.uid()
       and ec.organization_id = org
       and ec.status = 'active'
       and ec.relationship_slug in ('manager','owner','external_manager')
  )
  or exists (
    select 1 from public.company_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = org
       and m.status = 'active'
       and m.role in ('owner','admin','manager','external_manager')
  )
$$;
create or replace function public.can_manage_project(p_project_id uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.projects p
     where p.id = p_project_id
       and (
         public.owns_company(p.company_id)
         or public.manages_organization(p.organization_id)
         or public.is_admin()
       )
  );
$$;

alter table public.project_worker_assignments enable row level security;
create policy pwa_select on public.project_worker_assignments for select using (owns_worker(worker_id) OR can_manage_project(project_id));
create policy pwa_write on public.project_worker_assignments for all using (can_manage_project(project_id)) with check (can_manage_project(project_id));
revoke all on public.project_worker_assignments from public, anon, authenticated;
grant select on public.project_worker_assignments to authenticated;
grant select on public.profiles, public.workers, public.projects, public.organizations to authenticated;
