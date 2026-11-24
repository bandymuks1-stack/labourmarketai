-- ============================================================================
-- W11 Slice 2 proof harness — PRELUDE.
--
-- Builds the minimal faithful prerequisites so that the REAL migration file
--   supabase/migrations/20260803090000_project_assigned_worker_read_v1.sql
-- and the REAL rollback
--   supabase/rollbacks/20260803090000_project_assigned_worker_read_v1.down.sql
-- can be executed VERBATIM against a throwaway Postgres 15 instance and the
-- resulting READ MATRIX measured with real `set local role` probes.
--
-- WHAT THIS IS: the real `profiles` / `workers` / `companies` / `projects` DDL
-- (0001_initial_schema.sql) and the real `project_worker_assignments` DDL
-- (20260601091000_project_object_client_context.sql), the real `owns_company`
-- and `is_admin` helper bodies, and the real PRE-SLICE `projects_select`
-- policy — the exact `status = 'live' and auth.uid() is not null` posture that
-- has been live since 0001. The migration under test is NOT re-implemented
-- here; the runner applies it as-is.
--
-- WHAT THIS IS NOT: a full Supabase stack. There is no PostgREST and no real
-- JWT — `auth.uid()` is a session-GUC stub so one psql session can act as any
-- actor. RLS itself is genuinely enforced: every probe runs under
-- `set local role authenticated` (or `anon`), never as the superuser, so the
-- policy is what decides the row count.
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

-- ── real tables (trimmed to the columns this policy chain touches) ──────────
create table if not exists public.profiles (
  id    uuid primary key,
  role  text
);

create table if not exists public.workers (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid unique references public.profiles(id) on delete cascade,
  display_name text
);

create table if not exists public.companies (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid references public.profiles(id) on delete set null,
  display_name text
);

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  title      text,
  status     text check (status in ('draft','live','paused','closed'))
);

-- 20260601091000_project_object_client_context.sql:66-75, verbatim shape.
create table if not exists public.project_worker_assignments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  worker_id   uuid not null references public.workers(id) on delete cascade,
  status      text not null default 'active'
                check (status in ('active','ended')),
  assigned_at timestamptz not null default now(),
  ended_at    timestamptz,
  unique (project_id, worker_id)
);

-- ── real helper bodies (0001_initial_schema.sql:300-326) ────────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
$$;

create or replace function public.owns_company(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies x where x.id = c and x.profile_id = auth.uid()
  )
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.owns_company(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.owns_company(uuid) to authenticated;

-- ── RLS posture: authenticated may SELECT, anon holds no table grant ────────
alter table public.projects                   enable row level security;
alter table public.project_worker_assignments enable row level security;
alter table public.workers                    enable row level security;
alter table public.companies                  enable row level security;

grant select on public.projects,
                public.project_worker_assignments,
                public.workers,
                public.companies,
                public.profiles
  to authenticated;

-- Supabase's standard posture: `authenticated` HOLDS the write grants and RLS
-- is what decides. Arming them here is deliberate — without it a refused write
-- would be a missing-grant artefact ("permission denied for table") rather
-- than proof that the POLICY held the line, and the whole point of the write
-- probes is that this read-scope migration leaves that policy untouched.
grant insert, update, delete on public.projects to authenticated;

-- ── THE POLICY UNDER TEST, pre-slice (0001_initial_schema.sql:501-504) ──────
-- Copied verbatim. This is the shape the rollback must restore byte for byte.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select
  using (public.owns_company(company_id) or public.is_admin()
         or (status = 'live' and auth.uid() is not null));

-- Write policies exist so the proof can assert the migration never touches
-- them (0001_initial_schema.sql:505-514).
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert
  with check (public.owns_company(company_id) or public.is_admin());
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update
  using (public.owns_company(company_id) or public.is_admin())
  with check (public.owns_company(company_id) or public.is_admin());

-- Supporting reads, so a probe failure is never a missing-grant artefact.
drop policy if exists pwa_select_proof on public.project_worker_assignments;
create policy pwa_select_proof on public.project_worker_assignments for select using (true);
drop policy if exists workers_select_proof on public.workers;
create policy workers_select_proof on public.workers for select using (true);
drop policy if exists companies_select_proof on public.companies;
create policy companies_select_proof on public.companies for select using (true);
