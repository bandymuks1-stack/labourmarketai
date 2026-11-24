-- ============================================================================
-- W11 project lifecycle — FAITHFUL harness prelude.
--
-- Rebuilds only what the migration under test actually touches or calls, using
-- the REAL definitions from the repo's migrations:
--
--   projects                     0001_initial_schema.sql:140-152 (OLD check,
--                                including the dead 'closed' — the pre-W11 shape)
--   project_worker_assignments   20260601091000:66-75
--   audit_logs                   0001_initial_schema.sql:269-279
--   owns_company                 0001_initial_schema.sql:321-326
--   can_manage_project           20260601091000:22-35
--   is_assigned_to_project       20260803090000 (the APPLIED production shape)
--   caller_manages_worker        20260609120000:34-50
--
-- `auth.uid()` is emulated by a GUC so a probe can act as a specific person,
-- exactly like the W12 proof does. Nothing here re-implements the migration.
-- ============================================================================

create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid;
$$;

create table if not exists public.profiles (
  id uuid primary key,
  full_name text
);

create table if not exists public.companies (
  id uuid primary key,
  profile_id uuid unique references public.profiles(id) on delete cascade
);

create table if not exists public.organizations (
  id uuid primary key,
  owner_profile_id uuid
);

create table if not exists public.workers (
  id uuid primary key,
  profile_id uuid references public.profiles(id) on delete cascade
);

create table if not exists public.company_workers (
  company_id uuid references public.companies(id) on delete cascade,
  worker_id  uuid references public.workers(id) on delete cascade,
  status     text not null default 'active',
  primary key (company_id, worker_id)
);

create table if not exists public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid,
  organization_id uuid,
  relationship_slug text,
  status text not null default 'active'
);

-- THE PRE-W11 SHAPE: 'closed' present, 'completed' absent.
create table if not exists public.projects (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid references public.companies(id) on delete cascade,
  organization_id  uuid references public.organizations(id),
  title            text,
  country          text,
  city             text,
  start_date       date,
  end_date         date,
  status           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects
  add constraint projects_status_check
  check (status in ('draft','live','paused','closed'));

create table if not exists public.project_worker_assignments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  worker_id   uuid not null references public.workers(id) on delete cascade,
  status      text not null default 'active' check (status in ('active','ended')),
  assigned_at timestamptz not null default now(),
  ended_at    timestamptz,
  unique (project_id, worker_id)
);

create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  action      text,
  entity      text,
  entity_id   uuid,
  payload     jsonb,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable as $$ select false $$;

create or replace function public.owns_company(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.companies x
                  where x.id = c and x.profile_id = auth.uid());
$$;

create or replace function public.manages_organization(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.engagement_contexts ec
                  where ec.organization_id = o and ec.profile_id = auth.uid()
                    and ec.status = 'active'
                    and ec.relationship_slug in ('manager','owner','external_manager'));
$$;

create or replace function public.can_manage_project(p_project_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects p
     where p.id = p_project_id
       and ( public.owns_company(p.company_id)
          or public.manages_organization(p.organization_id)
          or public.is_admin() ));
$$;

-- The APPLIED production shape (20260803090000): an active assignment grants
-- the assigned worker a read of the project row.
create or replace function public.is_assigned_to_project(p_project_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_worker_assignments pwa
      join public.workers w on w.id = pwa.worker_id
     where pwa.project_id = p_project_id
       and pwa.status = 'active'
       and w.profile_id = auth.uid());
$$;

create or replace function public.caller_manages_worker(p_worker_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.company_workers cw
     where cw.worker_id = p_worker_id and cw.status = 'active'
       and public.owns_company(cw.company_id));
$$;

-- The pre-W11 assign RPC, so the rollback can be proved to restore it.
create or replace function public.assign_worker_to_project(
  p_project_id text, p_worker_profile_id text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pid uuid := nullif(p_project_id,'')::uuid;
  w_pid uuid := nullif(p_worker_profile_id,'')::uuid;
  w_id uuid; row_id uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  if pid is null or w_pid is null then raise exception 'Project and worker are required' using errcode='22023'; end if;
  select id into w_id from public.workers where profile_id = w_pid;
  if w_id is null then raise exception 'No such worker' using errcode='P0002'; end if;
  if not ((public.can_manage_project(pid) and public.caller_manages_worker(w_id)) or public.is_admin()) then
    raise exception 'Not authorized to assign this worker to this project' using errcode='42501';
  end if;
  insert into public.project_worker_assignments (project_id, worker_id, status, assigned_at, ended_at)
    values (pid, w_id, 'active', now(), null)
  on conflict (project_id, worker_id) do update set status='active', ended_at=null
  returning id into row_id;
  return row_id;
end $$;

create role authenticated;
create role anon;
