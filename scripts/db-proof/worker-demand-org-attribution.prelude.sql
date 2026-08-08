-- ============================================================================
-- Worker demand org attribution proof harness — PRELUDE.
--
-- Builds the minimal faithful prerequisites so that the REAL files
--   supabase/migrations/20260807120000_worker_demand_org_attribution_v1.sql
--   supabase/rollbacks/20260807120000_worker_demand_org_attribution_v1.down.sql
-- can be executed VERBATIM against a throwaway Postgres 15 instance. The
-- rollback file doubles as the BEFORE state: it restores the 20260711330000
-- body (profile-based company join), so the runner applies it first and the
-- production defect is reproduced from the real SQL, never re-implemented.
--
-- WHAT THIS IS: the column subset of `customer_requests` / `companies` /
-- `organizations` / `workers` / `company_demand_locations` that the RPC
-- touches, plus a session-GUC auth.uid() stub so one psql session can act as
-- any actor. Every probe runs under `set local role authenticated` (or anon),
-- never as the superuser.
--
-- STATED LIMITS: no PostgREST, no real JWT. `demand_structured_v2_public` is
-- a stub returning '{}'::jsonb — the structured projection is NOT under test
-- here (it is pinned by worker-demand-structured-exposure.test.ts); what is
-- under test is row count, attribution, the verified gate and the grants.
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

-- Session-scoped auth.uid() stub: each probe sets `app.uid`.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid
$$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

-- ── tables, trimmed to the columns the RPC touches ──────────────────────────
create table if not exists public.profiles (
  id   uuid primary key,
  role text
);

create table if not exists public.workers (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete cascade
);

create table if not exists public.companies (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid references public.profiles(id) on delete set null,
  legal_name          text,
  display_name        text,
  verification_status text not null default 'unverified',
  created_at          timestamptz not null default now()
);

create table if not exists public.organizations (
  id                uuid primary key default gen_random_uuid(),
  legacy_company_id uuid references public.companies(id)
);

create table if not exists public.customer_requests (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid references public.profiles(id) on delete cascade,
  organization_id   uuid references public.organizations(id),
  status            text not null default 'draft',
  role_or_work_type text,
  country           text,
  team_size         int,
  start_period      text,
  location          text,
  payload           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create table if not exists public.company_demand_locations (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid references public.customer_requests(id) on delete cascade,
  city           text,
  location_label text,
  active         boolean not null default true,
  updated_at     timestamptz not null default now()
);

-- ── stub: the structured_v2 whitelist helper (projection not under test) ────
create or replace function public.demand_structured_v2_public(p jsonb)
returns jsonb language sql immutable as $$ select '{}'::jsonb $$;
revoke all on function public.demand_structured_v2_public(jsonb) from public;
grant execute on function public.demand_structured_v2_public(jsonb) to authenticated;

-- The RPC is SECURITY DEFINER, so table RLS is not what it exercises; still
-- enable RLS with no policies so any accidental direct-table probe fails
-- closed rather than passing by superuser accident.
alter table public.customer_requests enable row level security;
alter table public.companies enable row level security;
alter table public.organizations enable row level security;
alter table public.company_demand_locations enable row level security;
