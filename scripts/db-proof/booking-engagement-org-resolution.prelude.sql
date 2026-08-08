-- ============================================================================
-- Booking→engagement ORG-FIRST resolution proof harness — PRELUDE.
--
-- Builds the minimal faithful prerequisites so that BOTH real migration files
--   supabase/migrations/20260802150000_booking_atomic_double_booking_v1.sql
--     (the CURRENT applied production v3 — the BEFORE state)
--   supabase/migrations/20260807140000_booking_engagement_org_resolution_v1.sql
--     (the migration under test)
-- can be executed VERBATIM against a throwaway Postgres instance. Nothing here
-- re-implements either migration.
--
-- WHAT THIS IS: the real `booking_requests` / `booking_request_events` DDL
-- (copied from the applied 20260613100100 + 20260711290000 migrations), the
-- real `company_worker_engagements` shape (20260723120000: nullable worker,
-- unique source_booking_id, one-active-per-pair partial index), and the
-- post-M-P0-6 shapes the org-first branch reads: `organizations` with
-- `legacy_company_id` (0013) and `customer_requests.organization_id`
-- (20260806200000).
--
-- WHAT THIS IS NOT: a full Supabase stack. RLS, PostgREST and real JWT auth
-- are out of scope — `auth.uid()` is a session-GUC stub. The RPC's own
-- authorization logic (is_subject_worker) still runs for real.
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
create schema if not exists extensions;

-- Session-scoped auth.uid() stub: each psql session sets `app.uid`.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid;
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select false $$;

-- ── Surrounding tables (minimum shape the RPC reads) ───────────────────────
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  display_name text
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade
);

-- organizations — the 0013 columns the org-first branch reads.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid references public.profiles(id) on delete cascade,
  legacy_company_id uuid references public.companies(id)
);

-- customer_requests — WITH the M-P0-6 organization stamp (20260806200000).
create table if not exists public.customer_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id)
);

-- ── booking_requests — VERBATIM from 20260613100100 + the 20260711290000
--    additive column. ────────────────────────────────────────────────────────
create table if not exists public.booking_requests (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references public.profiles(id) on delete cascade,
  request_id         uuid not null references public.customer_requests(id) on delete cascade,
  worker_id          uuid not null references public.workers(id) on delete cascade,
  status             text not null default 'proposed'
                       check (status in ('proposed','accepted','declined','withdrawn','expired')),
  start_date         date,
  expected_end_date  date,
  location_country   char(2),
  role_text          text check (role_text is null or char_length(role_text) <= 200),
  note               text check (note is null or char_length(note) <= 2000),
  readiness_snapshot jsonb not null default '{}'::jsonb,
  response_deadline_date date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (owner_id, request_id, worker_id),
  check (expected_end_date is null or start_date is null or expected_end_date >= start_date)
);

create table if not exists public.booking_request_events (
  id                 uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  actor_id           uuid not null references public.profiles(id),
  event_type         text not null
                       check (event_type in ('proposed','accepted','declined','withdrawn','expired',
                                             'rescheduled','deadline_set')),
  from_status        text,
  to_status          text not null,
  reason_kind        text,
  reason_note        text,
  created_at         timestamptz not null default now()
);

-- company_worker_engagements — the real 20260723120000 idempotency shape
-- (nullable worker, unique source_booking_id, one ACTIVE row per pair).
-- Created after booking_requests because of the source_booking_id FK.
create table if not exists public.company_worker_engagements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  worker_id uuid references public.workers(id) on delete set null,
  subject_key uuid not null default gen_random_uuid(),
  source_booking_id uuid not null references public.booking_requests(id) on delete restrict,
  status text not null default 'active' check (status in ('active','ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  unique (source_booking_id)
);

create unique index if not exists company_worker_engagements_active_pair_idx
  on public.company_worker_engagements (company_id, worker_id)
  where status = 'active';

-- ── §9 visibility: the REAL 20260723120000 read posture, verbatim ──────────
-- Copied so the proof can answer "who SEES the minted engagement" under real
-- roles, not just "was it minted". owns_company is the real 0001 helper.
grant usage on schema public to authenticated, anon;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant execute on function public.is_admin() to authenticated, anon;

create or replace function public.owns_company(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies x where x.id = c and x.profile_id = auth.uid()
  )
$$;
grant execute on function public.owns_company(uuid) to authenticated;

alter table public.company_worker_engagements enable row level security;

drop policy if exists company_worker_engagements_select on public.company_worker_engagements;
create policy company_worker_engagements_select
  on public.company_worker_engagements for select
  using (
    public.owns_company(company_id)
    or exists (
      select 1 from public.workers w
       where w.id = worker_id and w.profile_id = auth.uid()
    )
    or public.is_admin()
  );

grant select on public.company_worker_engagements to authenticated;
revoke insert, update, delete on public.company_worker_engagements from authenticated;
revoke all on public.company_worker_engagements from anon;
revoke all on public.company_worker_engagements from public;
grant select on public.workers to authenticated;
