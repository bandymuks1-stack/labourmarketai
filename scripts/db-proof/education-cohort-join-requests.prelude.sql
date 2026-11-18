-- Stand-ins for the production objects the two applied education migrations
-- (20260903120000, 20260903150000) and the J-12 migration reference. Only the
-- columns those migrations read exist here; they are applied VERBATIM on top.
create schema if not exists auth;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;
grant usage on schema public, auth, extensions to authenticated, anon;

create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to authenticated, anon;

create table public.profiles (id uuid primary key);
create table public.organizations (id uuid primary key, display_name text, legal_name text, archived_at timestamptz);
create table public.professions (slug text primary key, is_active boolean not null default true);
create table public.education_types (slug text primary key, is_active boolean not null default true);
create table public.organization_roles (organization_id uuid, role_slug text);
create table public.public_vacancies (id uuid primary key default gen_random_uuid(), profession_slug text, expires_at timestamptz, is_active boolean);
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid, action text, entity text, entity_id uuid, payload jsonb, occurred_at timestamptz not null default now());
create table public.relationship_types (slug text primary key);
insert into public.relationship_types values ('student'), ('manager'), ('owner'), ('external_manager'), ('employee');
create table public.company_memberships (profile_id uuid, organization_id uuid, role text, status text not null default 'active');
-- Stand-ins for the confirmation / hours side, so the proof can show accept writes none of it.
create table public.journal_entries (id uuid primary key default gen_random_uuid(), worker_id uuid, hours numeric);
create table public.journal_entry_confirmations (id uuid primary key default gen_random_uuid(), journal_entry_id uuid, confirmed_by uuid);
create table public.competency_recognitions (id uuid primary key default gen_random_uuid(), profile_id uuid);
create table public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  organization_id uuid, project_id uuid,
  relationship_slug text not null references public.relationship_types(slug),
  status text not null default 'active', is_primary boolean not null default false,
  title text, hash_self text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

-- manages_organization: the PRODUCTION predicate (20260806180000), which admits
-- external_manager, so the proof shows the J-12 commands do NOT rely on it.
create or replace function public.manages_organization(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.engagement_contexts ec
                  where ec.profile_id = auth.uid() and ec.organization_id = org and ec.status = 'active'
                    and ec.relationship_slug in ('manager','owner','external_manager'))
      or exists (select 1 from public.company_memberships m
                  where m.profile_id = auth.uid() and m.organization_id = org and m.status = 'active'
                    and m.role in ('owner','admin','manager','external_manager')) $$;
create or replace function public.is_admin() returns boolean language sql stable as $$ select false $$;
grant execute on function public.manages_organization(uuid), public.is_admin() to authenticated;
