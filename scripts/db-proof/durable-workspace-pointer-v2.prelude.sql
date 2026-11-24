-- ============================================================================
-- Durable workspace pointer v2 — PROOF HARNESS PRELUDE.
--
-- Builds the minimal faithful prerequisites so the REAL files
--   supabase/migrations/20260714210000_company_memberships_v1.sql   (old draft)
--   supabase/migrations/20260817160000_durable_workspace_pointer_v2.sql
--   supabase/rollbacks/20260817160000_durable_workspace_pointer_v2.down.sql
-- can be executed VERBATIM against a throwaway Postgres and the trigger's
-- accept/reject matrix measured per actor. Nothing here re-implements them.
--
-- Shapes are copied from the real migrations, not re-invented:
--   * profiles / organizations / engagement_contexts  -> 0013 (as deep as the
--     trigger + backfill read them)
--   * relationship_types (slug registry)              -> 0013 §10
--   * company_memberships                             -> 20260806090000 (the
--     columns the v2 trigger reads: organization_id, profile_id, role, status)
--   * profiles owner-only UPDATE policy               -> 0001/0004 (the new
--     column rides this policy — reproduced so probes run under real RLS)
--
-- auth.uid() is a session-GUC stub so one psql session can act as any actor,
-- exactly like the other db-proof preludes. Throwaway only — never point this
-- at production or a shared local stack.
-- ============================================================================

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon;          end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role;  end if;
end $$;

grant usage on schema public to authenticated, anon, service_role;

create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid;
$$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;

-- ── Spine tables, only as deep as the trigger + backfill read them ──────────
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.relationship_types (
  slug text primary key,
  category text not null default 'other',
  is_active boolean not null default true
);

insert into public.relationship_types (slug, category, is_active) values
  ('owner','other',true), ('manager','other',true),
  ('external_manager','other',true), ('employee','other',true)
on conflict (slug) do nothing;

create table if not exists public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  status text not null default 'active',
  relationship_slug text not null
);

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  role   text not null check (role in ('owner','admin','manager','external_manager','member')),
  status text not null default 'invited' check (status in ('invited','active','revoked'))
);

-- ── The 0001/0004 profiles posture the new column rides on ─────────────────
alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

grant select, update on public.profiles to authenticated;
