-- ============================================================================
-- TRAIN D — work_objects / work_tasks v2 / project responsible / notification
-- v4: PROOF HARNESS PRELUDE.
--
-- Builds the minimal faithful prerequisites so the REAL files
--   supabase/migrations/20260817150000_work_objects_v1.sql
--   supabase/migrations/20260817151000_work_tasks_v2_collaboration.sql
--   supabase/migrations/20260817152000_project_responsible_v1.sql
--   supabase/migrations/20260817153000_notification_events_v4_task_types.sql
-- (and their paired rollbacks) can be executed VERBATIM against a throwaway
-- Postgres and the resulting per-role authorization measured. Nothing here
-- re-implements them.
--
-- Everything below is copied from the real migrations, not re-invented:
--   * owns_company / owns_agency          -> 0001_initial_schema.sql
--   * manages_organization                -> 0013_work_journal_m1.sql
--   * can_manage_project                  -> 20260601091000_project_object_client_context.sql
--   * is_assigned_to_project              -> 20260803090000_project_assigned_worker_read_v1.sql
--   * caller_manages_worker (roster only) -> 20260609120000 (the pre-A1 body
--     is sufficient here: eligibility via company_memberships is what train D
--     mostly exercises; the roster branch covers caller_manages_worker paths)
--   * has_org_demand_access               -> 20260806200000_org_demand_spine_v2.sql
--   * company_memberships (+ RLS)        -> 20260806090000_company_memberships_v1.sql (shape)
--   * work_tasks v1 table + RLS + grants  -> 20260711210000_work_tasks_v1.sql (VERBATIM DDL)
--   * notification_events                 -> 20260810070000 (+ the APPLIED v2
--     type list from 20260813100000 — the production starting state)
--   * set_updated_at                      -> 0001_initial_schema.sql
--
-- `auth.uid()` and `is_admin()` are session-GUC stubs so one psql session can
-- act as any actor (the a1 harness idiom). Definer functions are owned by
-- postgres and RLS is not forced, matching production.
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

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── Surrounding spine ───────────────────────────────────────────────────────
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

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','admin','manager','external_manager','member')),
  status text not null default 'active' check (status in ('invited','active','revoked')),
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  title text,
  status text not null default 'draft'
    check (status in ('draft','live','paused','completed')),
  updated_at timestamptz not null default now()
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

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

grant select on public.workers, public.company_workers, public.agency_workers,
                public.projects, public.project_worker_assignments,
                public.company_memberships to authenticated;

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

create or replace function public.is_assigned_to_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.project_worker_assignments pwa
      join public.workers w on w.id = pwa.worker_id
     where pwa.project_id = p_project_id
       and pwa.status = 'active'
       and w.profile_id = auth.uid()
  );
$$;
revoke all on function public.is_assigned_to_project(uuid) from public;
grant execute on function public.is_assigned_to_project(uuid) to authenticated;

create or replace function public.caller_manages_worker(p_worker_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
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

create or replace function public.has_org_demand_access(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select org is not null and exists (
    select 1 from public.company_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = org
       and m.status = 'active'
       and m.role in ('owner','admin','manager','external_manager')
  )
$$;
revoke all on function public.has_org_demand_access(uuid) from public;
grant execute on function public.has_org_demand_access(uuid) to authenticated;

-- ── work_tasks v1: VERBATIM DDL from the APPLIED 20260711210000 ─────────────
create table if not exists public.work_tasks (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid references public.projects(id) on delete cascade,
  source_type         text check (source_type in ('project','booking','demand','company')),
  source_id           uuid,
  title               text not null check (
                        char_length(trim(title)) >= 3
                        and char_length(title) <= 160
                      ),
  description         text check (char_length(description) <= 2000),
  status              text not null default 'todo'
                        check (status in ('todo','in_progress','blocked','done','cancelled')),
  priority            text not null default 'normal'
                        check (priority in ('low','normal','high')),
  assignee_profile_id uuid references public.profiles(id) on delete set null,
  created_by          uuid not null references public.profiles(id) on delete cascade,
  due_at              timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  constraint wt_source_shape check (
    (source_type is null and source_id is null)
    or
    (source_type is not null and source_id is not null)
  ),
  constraint wt_resolved_shape check (
    (status in ('done','cancelled') and resolved_at is not null)
    or
    (status in ('todo','in_progress','blocked') and resolved_at is null)
  )
);

alter table public.work_tasks enable row level security;
drop policy if exists wt_select on public.work_tasks;
create policy wt_select on public.work_tasks
  for select to authenticated
  using (
    created_by = auth.uid()
    or assignee_profile_id = auth.uid()
    or public.is_admin()
    or (project_id is not null and public.can_manage_project(project_id))
  );
grant select on public.work_tasks to authenticated;
revoke insert, update, delete on public.work_tasks from authenticated;

-- ── notification_events: the APPLIED v1 shape with the v2 type list ─────────
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null
    constraint notification_events_type_check check (event_type in (
      'booking_proposed','booking_accepted','booking_declined',
      'booking_withdrawn','absence_requested','absence_approved',
      'absence_rejected','engagement_created','engagement_ended'
    )),
  entity_type text not null
    constraint notification_events_entity_type_check check (entity_type in (
      'booking_request','worker_absence','engagement'
    )),
  entity_id uuid not null,
  dedupe_key text not null
    constraint notification_events_dedupe_key_bounded check (char_length(dedupe_key) <= 200),
  metadata jsonb not null default '{}'::jsonb
    constraint notification_events_metadata_bounded check (pg_column_size(metadata) <= 2048),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notification_events_dedupe unique (recipient_profile_id, dedupe_key)
);
