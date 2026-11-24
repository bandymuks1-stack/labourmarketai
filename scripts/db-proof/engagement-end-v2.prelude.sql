-- ============================================================================
-- §7.1 booking-engagement-end proof harness — PRELUDE.
--
-- Builds the minimal faithful prerequisites so that the REAL migration
--   supabase/migrations/20260804160000_booking_engagement_end_v2.sql
-- and the REAL rollback
--   supabase/rollbacks/20260804160000_booking_engagement_end_v2.down.sql
-- can be executed VERBATIM against a throwaway Postgres and the resulting
-- ACTOR MATRIX measured with real `set local role` probes.
--
-- WHAT THIS IS: the real `company_worker_engagements` DDL, its real RLS
-- policy, its real grants and the real `end_company_worker_engagement_v1`
-- body — all copied from the applied 20260723120000 — plus the real
-- `owns_company` / `is_admin` helpers from 0001. The function under test is
-- NOT re-implemented here; the runner applies its file as-is.
--
-- WHAT THIS IS NOT: a full Supabase stack. There is no PostgREST and no real
-- JWT — `auth.uid()` is a session-GUC stub so one psql session can act as any
-- actor. RLS is genuinely enforced: every probe runs under
-- `set local role authenticated` (or `anon`), never as the superuser.
--
-- THE FOUR WITNESS TABLES at the end (projects, project_worker_assignments,
-- engagement_contexts, experience_records, audit_logs) exist for ONE purpose:
-- to be counted before and after. The claim "ending an engagement completes no
-- project, ends no membership, creates no experience and writes no second
-- audit trail" is only worth making if something would notice.
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

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid
$$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

-- ── real tables (trimmed to the columns this chain touches) ─────────────────
create table if not exists public.profiles (
  id   uuid primary key,
  role text
);

create table if not exists public.workers (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid unique references public.profiles(id) on delete cascade,
  display_name text
);

create table if not exists public.companies (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid references public.profiles(id) on delete set null,
  display_name text,
  legal_name   text
);

-- Provenance anchor. `source_booking_id` is NOT NULL with ON DELETE RESTRICT
-- in the real table, so the harness needs real rows to point at.
create table if not exists public.booking_requests (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid references public.workers(id) on delete set null,
  status     text not null default 'accepted'
);

-- ── the real helper bodies (0001_initial_schema.sql:300-326) ────────────────
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

-- ── THE TABLE UNDER TEST — 20260723120000 lines 149-210, verbatim shape ─────
create table if not exists public.company_worker_engagements (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  worker_id         uuid references public.workers(id) on delete set null,
  subject_key       uuid not null default gen_random_uuid(),
  source_booking_id uuid not null references public.booking_requests(id) on delete restrict,
  status            text not null default 'active'
                      check (status in ('active','ended')),
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  ended_by          uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null,
  unique (source_booking_id)
);

create unique index if not exists company_worker_engagements_active_pair_idx
  on public.company_worker_engagements (company_id, worker_id)
  where status = 'active';

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

-- Writes are RPC-only — verbatim from 20260723120000:207-210.
grant select on public.company_worker_engagements to authenticated;
revoke insert, update, delete on public.company_worker_engagements from authenticated;
revoke all on public.company_worker_engagements from anon;
revoke all on public.company_worker_engagements from public;

-- ── v1, verbatim (20260723120000:491-532) ───────────────────────────────────
-- Present so the proof can show the rollback drops ONLY v2 and leaves this
-- one exactly as its OWN migration created it.
create or replace function public.end_company_worker_engagement_v1(
  p_engagement_id uuid
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  e   public.company_worker_engagements%rowtype;
  may_end boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into e from public.company_worker_engagements where id = p_engagement_id;
  if e.id is null then
    return false;
  end if;

  select public.owns_company(e.company_id)
      or exists (select 1 from public.workers w
                  where w.id = e.worker_id and w.profile_id = uid)
    into may_end;
  if not may_end then
    return false;
  end if;

  if e.status is distinct from 'active' then
    return false;
  end if;

  update public.company_worker_engagements
     set status = 'ended', ended_at = now(), ended_by = uid
   where id = e.id and status = 'active';
  return found;
end;
$$;
revoke all on function public.end_company_worker_engagement_v1(uuid) from public;
revoke all on function public.end_company_worker_engagement_v1(uuid) from anon;
grant execute on function public.end_company_worker_engagement_v1(uuid) to authenticated;

-- ── supporting reads, so a probe failure is never a missing-grant artefact ──
grant select on public.workers, public.companies, public.profiles,
                public.booking_requests to authenticated;
alter table public.workers   enable row level security;
alter table public.companies enable row level security;
drop policy if exists workers_select_proof on public.workers;
create policy workers_select_proof on public.workers for select using (true);
drop policy if exists companies_select_proof on public.companies;
create policy companies_select_proof on public.companies for select using (true);

-- ── WITNESS TABLES — the things that must NOT change ────────────────────────
-- Each stands in for a real domain the confirmation copy promises is not
-- touched. They are counted before and after every end.
create table if not exists public.projects (
  id     uuid primary key default gen_random_uuid(),
  status text not null default 'live'
);
create table if not exists public.project_worker_assignments (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  worker_id  uuid references public.workers(id) on delete cascade,
  status     text not null default 'active'
);
create table if not exists public.engagement_contexts (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  status     text not null default 'active'
);
create table if not exists public.experience_records (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid references public.profiles(id) on delete set null
);
create table if not exists public.audit_logs (
  id      uuid primary key default gen_random_uuid(),
  action  text
);
