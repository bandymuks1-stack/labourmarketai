-- ============================================================================
-- A1 — caller_manages_worker vs booking engagements: PROOF HARNESS PRELUDE.
--
-- Builds the minimal faithful prerequisites so the REAL files
--   supabase/migrations/20260808150000_caller_manages_worker_engagements_v1.sql
--   supabase/rollbacks/20260808150000_caller_manages_worker_engagements_v1.down.sql
-- can be executed VERBATIM against a throwaway Postgres and the resulting
-- per-role authorization measured. Nothing here re-implements them.
--
-- Everything below is copied from the real migrations, not re-invented:
--   * owns_company / owns_agency            -> 0001_initial_schema.sql
--   * manages_organization                  -> 0013_work_journal_m1.sql
--   * can_manage_project                    -> 20260601091000_project_object_client_context.sql
--   * caller_manages_worker (roster-only)   -> 20260609120000_project_worker_assignment_gate.sql
--   * worker_absences DDL + review RPC      -> 20260718150000_leave_absence.sql
--   * company_worker_engagements DDL        -> 20260723120000_company_worker_engagements_v1.sql
--   * caller_has_booking_engagement_for_project -> 20260723120000 (same file)
--   * assign_worker_to_project              -> 20260804120000_project_lifecycle_v1.sql
--     (the APPLIED body — note it DROPPED 20260723120000's engagement
--      OR-branch; that regression is part of what this proof measures)
--   * worker_absences_select (requested-only for managers)
--     + worker_absence_scheduling view      -> 20260808120000_worker_absence_scheduling_view_v1.sql
--
-- The starting state this prelude reproduces is PRODUCTION AS OF 2026-08-08,
-- verified by catalog read against prod `gorgitwvdzxbnaxhrsrw`:
-- `caller_manages_worker.prosrc` does not mention company_worker_engagements,
-- and `assign_worker_to_project.prosrc` does not mention
-- caller_has_booking_engagement_for_project.
--
-- WHAT THIS IS NOT: a full Supabase stack. `auth.uid()` and `is_admin()` are
-- session-GUC stubs so one psql session can act as any actor. Faithful for
-- this proof: both are `stable` functions the policies call per row, as in
-- prod. Definer functions are owned by `postgres` and `relforcerowsecurity`
-- is left false, matching production, so definer functions bypass RLS here
-- exactly as they do there.
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

-- The organization spine, only as deep as can_manage_project /
-- caller_has_booking_engagement_for_project actually read it.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  legacy_company_id uuid references public.companies(id) on delete set null
);

create table if not exists public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  status text not null default 'active',
  relationship_slug text not null
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','live','paused','completed'))
);

create table if not exists public.project_worker_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  worker_id  uuid not null references public.workers(id)  on delete cascade,
  status text not null default 'active',
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (project_id, worker_id)
);

-- Only the columns the engagement FK needs; the booking body is not exercised.
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'accepted'
);

grant select on public.workers, public.company_workers, public.agency_workers,
                public.projects, public.project_worker_assignments to authenticated;

-- ── Real helpers, copied verbatim ───────────────────────────────────────────
create or replace function public.owns_company(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.companies x where x.id = c and x.profile_id = auth.uid())
$$;

create or replace function public.owns_agency(a uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agencies x where x.id = a and x.profile_id = auth.uid())
$$;

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

create or replace function public.can_manage_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
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
revoke all on function public.can_manage_project(uuid) from public;
grant execute on function public.can_manage_project(uuid) to authenticated;

-- PRE-CHANGE caller_manages_worker: roster only. THIS IS THE DEFECT.
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

-- ── company_worker_engagements: the REAL 20260723120000 shape + RLS ─────────
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

grant select on public.company_worker_engagements to authenticated;
revoke insert, update, delete on public.company_worker_engagements from authenticated;

-- Project-bound engagement helper, verbatim from 20260723120000.
create or replace function public.caller_has_booking_engagement_for_project(
  p_worker_id  uuid,
  p_project_id uuid
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null and exists (
    select 1
      from public.company_worker_engagements e
      join public.companies     c on c.id = e.company_id
      join public.projects      p on p.id = p_project_id
      join public.organizations o on o.id = p.organization_id
     where e.worker_id is not null
       and e.worker_id = p_worker_id
       and e.status = 'active'
       and c.profile_id is not distinct from auth.uid()
       and o.legacy_company_id is not distinct from e.company_id
  );
$$;
revoke all on function public.caller_has_booking_engagement_for_project(uuid, uuid) from public;
grant execute on function public.caller_has_booking_engagement_for_project(uuid, uuid) to authenticated;

-- ── worker_absences: the REAL 20260718150000 shape + review RPC ─────────────
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

-- The POST-20260808120000 policy (applied to prod 2026-08-08): a manager
-- reaches ONLY `status='requested'` rows on the base table; approved
-- unavailability is reachable only through the scheduling view.
drop policy if exists worker_absences_select on public.worker_absences;
create policy worker_absences_select on public.worker_absences
  for select
  using (
    exists (select 1 from public.workers w where w.id = worker_absences.worker_id and w.profile_id = auth.uid())
    or (public.caller_manages_worker(worker_id) and status = 'requested')
    or public.is_admin()
  );

grant select on public.worker_absences to authenticated;

-- Scheduling view, verbatim shape from 20260808120000: scheduling columns
-- only, no note, no absence_type, approved rows only.
create or replace view public.worker_absence_scheduling
with (security_invoker = false) as
  select a.id, a.worker_id, a.start_date, a.end_date, a.half_day, a.status
    from public.worker_absences a
   where a.status = 'approved'
     and (
       exists (select 1 from public.workers w where w.id = a.worker_id and w.profile_id = auth.uid())
       or public.caller_manages_worker(a.worker_id)
       or public.is_admin()
     );
grant select on public.worker_absence_scheduling to authenticated;

create or replace function public.review_worker_absence_v1(
  p_absence_id uuid,
  p_decision text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker uuid;
  v_status text;
begin
  select worker_id, status into v_worker, v_status from public.worker_absences where id = p_absence_id;
  if v_worker is null then
    raise exception 'absence not found';
  end if;
  if not public.caller_manages_worker(v_worker) then
    raise exception 'not authorized to review this absence';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'invalid decision';
  end if;
  if v_status <> 'requested' then
    raise exception 'only a requested absence can be reviewed';
  end if;
  update public.worker_absences
     set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_absence_id;
end;
$$;
grant execute on function public.review_worker_absence_v1(uuid, text) to authenticated;

-- ── assign_worker_to_project: the APPLIED 20260804120000 body ───────────────
-- NOTE the missing engagement OR-branch: 20260723120000 added it, W11's
-- 20260804120000 re-issued the function from the pre-engagement body and
-- dropped it. Reproduced faithfully so the proof measures the real starting
-- state, not the intended one.
create or replace function public.assign_worker_to_project(
  p_project_id        text,
  p_worker_profile_id text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  pid     uuid := nullif(p_project_id, '')::uuid;
  w_pid   uuid := nullif(p_worker_profile_id, '')::uuid;
  w_id    uuid;
  row_id  uuid;
  v_status text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if pid is null or w_pid is null then
    raise exception 'Project and worker are required' using errcode = '22023';
  end if;

  select id into w_id from public.workers where profile_id = w_pid;
  if w_id is null then
    raise exception 'No such worker' using errcode = 'P0002';
  end if;

  if not (
    (public.can_manage_project(pid) and public.caller_manages_worker(w_id))
    or public.is_admin()
  ) then
    raise exception 'Not authorized to assign this worker to this project'
      using errcode = '42501';
  end if;

  select status into v_status from public.projects where id = pid;
  if v_status = 'completed' then
    raise exception 'Project is completed' using errcode = '22023';
  end if;

  insert into public.project_worker_assignments (project_id, worker_id, status, assigned_at, ended_at)
    values (pid, w_id, 'active', now(), null)
  on conflict (project_id, worker_id) do update
    set status = 'active', ended_at = null
  returning id into row_id;

  return row_id;
end;
$$;
grant execute on function public.assign_worker_to_project(text, text) to authenticated;
