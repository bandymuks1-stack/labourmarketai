-- ============================================================================
-- W12 Slice 1 proof harness — PRELUDE.
--
-- Builds the minimal faithful prerequisites so that the REAL migration file
-- `supabase/migrations/20260802150000_booking_atomic_double_booking_v1.sql`
-- can be executed VERBATIM against a throwaway Postgres 15 instance and its
-- concurrency behaviour measured with two independent sessions.
--
-- WHAT THIS IS: the real `booking_requests` / `booking_request_events` DDL
-- (copied from the applied 20260613100100 + 20260711290000 migrations), the
-- real pre-slice RPC bodies, and the minimum surrounding tables the engagement
-- branch touches. The migration under test is NOT re-implemented here — it is
-- applied as-is by the runner.
--
-- WHAT THIS IS NOT: a full Supabase stack. RLS, PostgREST and real JWT auth
-- are out of scope — `auth.uid()` is a session-GUC stub so two psql sessions
-- can act as two different workers. Authorization logic is still exercised
-- (the RPC's own `is_subject_worker` check runs), but RLS policy enforcement
-- is proven separately by the existing secdef smoke proofs.
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

create table if not exists public.customer_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade
);

create table if not exists public.company_worker_engagements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  source_booking_id uuid unique,
  status text not null default 'active',
  created_by uuid,
  created_at timestamptz not null default now()
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

-- ── RE-RUN ISOLATION ───────────────────────────────────────────────────────
-- The prelude must restore the exact PRE-slice state, otherwise a second run
-- inherits the constraint installed by the previous run's migration step and
-- the BEFORE phase silently "passes" by not reproducing the defect at all.
-- Dropping it here keeps the BEFORE/AFTER comparison honest on every run.
alter table if exists public.booking_requests
  drop constraint if exists booking_requests_no_overlapping_accepted;

-- ── PRE-SLICE v3 body (the defect under test), so the harness can measure the
--    BEFORE behaviour and then the AFTER behaviour on the same fixtures. ─────
create or replace function public.respond_booking_request_v3(
  p_booking_id uuid, p_decision text, p_reason_kind text, p_reason_note text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  br  public.booking_requests%rowtype;
  is_subject_worker boolean;
  v_engagement text := null;
begin
  if uid is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  if p_decision not in ('accepted','declined') then
    raise exception 'Invalid decision' using errcode='22023';
  end if;

  select * into br from public.booking_requests where id = p_booking_id;
  if br.id is null then raise exception 'Booking not found' using errcode='P0002'; end if;

  select exists (select 1 from public.workers w
                  where w.id = br.worker_id and w.profile_id = uid)
    into is_subject_worker;
  if not is_subject_worker then
    raise exception 'Only the addressed worker may respond' using errcode='42501';
  end if;
  if br.status is distinct from 'proposed' then
    raise exception 'Booking is no longer open' using errcode='22023';
  end if;

  if p_decision = 'accepted' and br.start_date is not null then
    if exists (
      select 1 from public.booking_requests other
       where other.worker_id = br.worker_id
         and other.id <> br.id
         and other.status = 'accepted'
         and other.start_date is not null
         and daterange(other.start_date, coalesce(other.expected_end_date, other.start_date), '[]')
             && daterange(br.start_date, coalesce(br.expected_end_date, br.start_date), '[]')
    ) then
      raise exception 'Conflicting accepted booking for these dates' using errcode='23P01';
    end if;
  end if;

  update public.booking_requests set status = p_decision, updated_at = now()
   where id = br.id;

  insert into public.booking_request_events
      (booking_request_id, actor_id, event_type, from_status, to_status)
    values (br.id, uid, p_decision, 'proposed', p_decision);

  return jsonb_build_object('decision', p_decision, 'engagement', v_engagement);
end;
$$;
