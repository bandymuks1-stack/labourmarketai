-- ============================================================================
-- W12 employer absence privacy hardening — PROOF HARNESS PRELUDE.
--
-- Builds the minimal faithful prerequisites so the REAL files
--   supabase/migrations/20260808120000_worker_absence_scheduling_view_v1.sql
--   supabase/rollbacks/20260808120000_worker_absence_scheduling_view_v1.down.sql
-- can be executed VERBATIM against a throwaway Postgres 15 instance and the
-- resulting ROW-LEVEL and COLUMN-LEVEL behaviour measured per role.
--
-- Everything below is copied from the real migrations, not re-invented:
--   * owns_company / owns_agency          -> 0001_initial_schema.sql
--   * caller_manages_worker               -> 20260609120000_project_worker_assignment_gate.sql
--   * worker_absences DDL + RLS + policy  -> 20260718150000_leave_absence.sql
--
-- WHAT THIS IS NOT: a full Supabase stack. `auth.uid()` and `is_admin()` are
-- session-GUC stubs so one psql session can act as any actor. Faithful for this
-- proof: both are `stable` functions the policies call per row, as in prod.
--
-- Definer functions are owned by `postgres` and `relforcerowsecurity` is left
-- false, matching production, so definer functions and the definer VIEW bypass
-- RLS here exactly as they do there.
--
-- Throwaway only. Never point this at production or at a shared local stack.
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

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('app.is_admin', true), ''), 'false')::boolean;
$$;
grant execute on function public.is_admin() to authenticated, anon, service_role;

-- ── Surrounding spine (minimum shape the FKs + helpers need) ────────────────
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade
);

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade
);

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  display_name text
);

create table if not exists public.company_workers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  worker_id  uuid not null references public.workers(id)   on delete cascade,
  status text not null default 'active'
);

create table if not exists public.agency_workers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  worker_id uuid not null references public.workers(id)  on delete cascade,
  status text not null default 'active'
);

grant select on public.workers, public.company_workers, public.agency_workers to authenticated;

-- ── Real helpers, copied verbatim ───────────────────────────────────────────
create or replace function public.owns_company(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.companies x where x.id = c and x.profile_id = auth.uid())
$$;

create or replace function public.owns_agency(a uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agencies x where x.id = a and x.profile_id = auth.uid())
$$;

create or replace function public.caller_manages_worker(p_worker_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.company_workers cw
     where cw.worker_id = p_worker_id and cw.status = 'active'
       and public.owns_company(cw.company_id)
  ) or exists (
    select 1 from public.agency_workers aw
     where aw.worker_id = p_worker_id and aw.status = 'active'
       and public.owns_agency(aw.agency_id)
  );
$$;
revoke all on function public.caller_manages_worker(uuid) from public;
grant execute on function public.caller_manages_worker(uuid) to authenticated;

-- ── worker_absences: the REAL 20260718150000 shape, RLS and policy ──────────
create table if not exists public.worker_absences (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  absence_type text not null
    check (absence_type in ('annual_leave','sickness','unpaid','training','other')),
  start_date date not null,
  end_date date not null,
  half_day boolean not null default false,
  note text,
  status text not null default 'requested'
    check (status in ('requested','approved','rejected','cancelled')),
  requested_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_absences_dates check (end_date >= start_date),
  constraint worker_absences_note_len check (note is null or char_length(note) <= 500)
);

alter table public.worker_absences enable row level security;

drop policy if exists worker_absences_select on public.worker_absences;
create policy worker_absences_select on public.worker_absences
  for select
  using (
    exists (select 1 from public.workers w where w.id = worker_absences.worker_id and w.profile_id = auth.uid())
    or public.caller_manages_worker(worker_id)
    or public.is_admin()
  );

grant select on public.worker_absences to authenticated;
