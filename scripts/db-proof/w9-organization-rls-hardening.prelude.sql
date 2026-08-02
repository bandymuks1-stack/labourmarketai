-- ============================================================================
-- W9 Slice 2 proof harness — PRELUDE.
--
-- Builds the minimal faithful prerequisites so that the REAL migration files
--   supabase/migrations/20260802160000_org_membership_revocation_v1.sql  (slice 1)
--   supabase/migrations/20260802170000_organization_rls_hardening_v1.sql (slice 2)
-- and the REAL rollback
--   supabase/rollbacks/20260802170000_organization_rls_hardening_v1.down.sql
-- can each be executed VERBATIM against a throwaway Postgres instance and the
-- resulting ROW-LEVEL BEHAVIOUR measured. Nothing here re-implements the
-- migration under test.
--
-- WHAT THIS IS: the real `organizations` / `engagement_contexts` / `audit_logs`
-- DDL (copied from 0001 + 0013 + the 20260719120000 public-profile columns),
-- the real `manages_organization()` helper, and the real 0013 policies and
-- grants — including `organizations_select ... using (true)`, the P0 under
-- test. RLS is genuinely enforced here: every probe runs under `set local role
-- authenticated` (or `anon`), never as the superuser, so the policies actually
-- decide what comes back.
--
-- WHAT THIS IS NOT: a full Supabase stack. There is no PostgREST and no real
-- JWT — `auth.uid()` and `is_admin()` are session-GUC stubs so one psql
-- session can act as any actor. That substitution is faithful for this proof
-- because both are `stable` functions the policies call exactly once per row,
-- which is how they behave in production too.
--
-- MATCHES PRODUCTION (verified read-only 2026-08-02 on gorgitwvdzxbnaxhrsrw):
--   `relforcerowsecurity` = false on both tables, and every SECURITY DEFINER
--   function is owned by `postgres`. The harness reproduces both, so definer
--   functions bypass RLS here exactly as they do in production.
--
-- Throwaway only. Never point this at production or at a shared local stack.
-- ============================================================================

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname='anon') then
    create role anon;
  end if;
end $$;

create schema if not exists auth;

-- Session-scoped stubs: each probe sets `app.uid` / `app.is_admin`.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid;
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('app.is_admin', true), ''), 'false')::boolean;
$$;

-- ── Surrounding tables (minimum shape the FKs need) ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.countries (
  code text primary key
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade
);

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.relationship_types (
  slug text primary key
);

insert into public.relationship_types(slug) values
  ('manager'), ('owner'), ('external_manager'), ('employee')
on conflict do nothing;

insert into public.countries(code) values ('NL'), ('LT') on conflict do nothing;

-- ── audit_logs — VERBATIM from 0001_initial_schema.sql:269 ──────────────────
create table if not exists public.audit_logs (
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

-- ── organizations — VERBATIM from 0013_work_journal_m1.sql ──────────────────
create table if not exists public.organizations (
  id                uuid primary key default gen_random_uuid(),
  owner_profile_id  uuid references public.profiles(id) on delete set null,
  organization_type text not null check (organization_type in ('company','agency','other')),
  legal_name        text,
  display_name      text,
  country           text references public.countries(code),
  description       text,
  vat_number        text,
  website           text,
  trust_score       integer not null default 0,
  legacy_company_id uuid references public.companies(id),
  legacy_agency_id  uuid references public.agencies(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── the 20260719120000 public-profile columns (lines 23-28), verbatim ───────
alter table public.organizations
  add column if not exists public_profile_enabled boolean not null default false,
  add column if not exists public_slug text,
  add column if not exists public_tagline text,
  add column if not exists public_contact_email text,
  add column if not exists public_contact_phone text;

-- ── engagement_contexts — VERBATIM from 0013 ────────────────────────────────
create table if not exists public.engagement_contexts (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  organization_id   uuid references public.organizations(id) on delete set null,
  project_id        uuid references public.projects(id) on delete set null,
  relationship_slug text not null references public.relationship_types(slug),
  country_code      text references public.countries(code),
  status            text not null default 'active' check (status in ('active','paused','ended')),
  started_at        date,
  ended_at          date,
  title             text,
  description       text,
  is_primary        boolean not null default false,
  hash_prev         text,
  hash_self         text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── the 20260530140000 additive columns (lines 46-49), verbatim. The W9
--    slice 1 RPC writes `journal_review_enabled` when it ends a membership.
alter table public.engagement_contexts
  add column if not exists operations_role text;
alter table public.engagement_contexts
  add column if not exists journal_review_enabled boolean not null default false;

-- ── manages_organization() — VERBATIM from 0013:109 ─────────────────────────
create or replace function public.manages_organization(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = auth.uid()
       and ec.organization_id = org
       and ec.status = 'active'
       and ec.relationship_slug in ('manager','owner','external_manager')
  )
$$;

-- ── the 0013 RLS posture, VERBATIM — this is the PRE-SLICE state under test ──
alter table public.organizations enable row level security;
create policy organizations_select on public.organizations for select using (true);
create policy organizations_write_admin on public.organizations for all using (is_admin()) with check (is_admin());

alter table public.engagement_contexts enable row level security;
create policy engagement_contexts_select on public.engagement_contexts for select
  using (profile_id = auth.uid() or manages_organization(organization_id) or is_admin());
create policy engagement_contexts_write on public.engagement_contexts for all
  using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());

-- ── the 0013 grants, VERBATIM (0013:409 and 0013:416) ───────────────────────
grant usage on schema public to authenticated, anon;
grant select on public.organizations      to authenticated;
grant select on public.engagement_contexts to authenticated;
