-- ============================================================================
-- TIMESHEETS v1 — PROOF HARNESS PRELUDE (journal + worker spine half).
--
-- Loaded ON TOP of scripts/db-proof/workflow-engine-v1.prelude.sql (which
-- provides auth.uid()/is_admin() stubs, profiles, organizations,
-- company_memberships, engagement_contexts, membership_actor_role_v1 and
-- belongs_to_organization — all copied verbatim from the real migrations).
--
-- This file adds the minimal faithful shapes the timesheets migration reads:
--   * workers                    -> 0001_initial_schema.sql (subset)
--   * journal_entries            -> 0013 + 0018 lifecycle columns (subset)
--   * journal_entry_metrics      -> 0013 (subset, no productivity_units FK)
--   * journal_entry_work_items   -> 20260601090000 (faithful subset)
--   * projects                   -> title only (line projectTitle join)
--   * owns_worker                -> 0001 (verbatim body)
--   * manages_organization       -> 20260806180000 (verbatim body)
-- Nothing here re-implements anything under test.
--
-- Throwaway only. Never point this at production or a shared local stack.
-- ============================================================================

create table if not exists public.workers (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid unique references public.profiles(id) on delete cascade,
  display_name text
);

create table if not exists public.projects (
  id    uuid primary key default gen_random_uuid(),
  title text
);

create table if not exists public.journal_entries (
  id            uuid primary key default gen_random_uuid(),
  worker_id     uuid not null references public.workers(id) on delete cascade,
  project_id    uuid references public.projects(id) on delete set null,
  original_text text,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  superseded_by uuid references public.journal_entries(id),
  correction_of uuid references public.journal_entries(id)
);

create table if not exists public.journal_entry_metrics (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.journal_entries(id) on delete cascade,
  metric_slug   text not null,
  value_numeric numeric,
  value_text    text,
  unit_slug     text,
  created_at    timestamptz not null default now()
);

create table if not exists public.journal_entry_work_items (
  id               uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  worker_id        uuid not null references public.workers(id) on delete cascade,
  organization_id  uuid references public.organizations(id) on delete set null,
  work_type_key    text,
  title            text not null,
  hours_numeric    numeric(6,2),
  unit             text check (unit is null or unit in ('hours','minutes','days')),
  status           text not null default 'suggested'
                     check (status in ('suggested','confirmed','rejected','needs_clarification')),
  created_at       timestamptz not null default now()
);

grant select on public.workers, public.projects, public.journal_entries,
                public.journal_entry_metrics, public.journal_entry_work_items
  to authenticated;

-- Real helper, copied verbatim from 0001_initial_schema.sql
create or replace function public.owns_worker(w uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workers x where x.id = w and x.profile_id = auth.uid()
  )
$$;
revoke all on function public.owns_worker(uuid) from public;
grant execute on function public.owns_worker(uuid) to authenticated;

-- Real helper, copied verbatim from 20260806180000_membership_authority_widening_v1.sql
create or replace function public.manages_organization(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = auth.uid()
       and ec.organization_id = org
       and ec.status = 'active'
       and ec.relationship_slug in ('manager','owner','external_manager')
  )
  or exists (
    select 1 from public.company_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = org
       and m.status = 'active'
       and m.role in ('owner','admin','manager','external_manager')
  )
$$;
revoke all on function public.manages_organization(uuid) from public;
revoke all on function public.manages_organization(uuid) from anon;
grant execute on function public.manages_organization(uuid) to authenticated;
