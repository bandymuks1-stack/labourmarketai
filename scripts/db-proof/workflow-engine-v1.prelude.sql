-- ============================================================================
-- WORKFLOW & APPROVAL ENGINE v1 — PROOF HARNESS PRELUDE.
--
-- Builds the minimal faithful prerequisites so the REAL files
--   supabase/migrations/20260817120000_workflow_engine_v1.sql
--   supabase/migrations/20260817121000_notification_events_v3_workflow_types.sql
--   supabase/rollbacks/20260817120000_workflow_engine_v1.down.sql
--   supabase/rollbacks/20260817121000_notification_events_v3_workflow_types.down.sql
-- can be executed VERBATIM against a throwaway Postgres and the resulting
-- per-role behaviour measured. Nothing here re-implements them.
--
-- Everything below is copied from the real migrations, not re-invented:
--   * membership_actor_role_v1 + belongs_to_organization
--       -> 20260806120000_company_membership_commands_v1.sql (verbatim)
--   * company_memberships shape -> 20260806090000_company_memberships_v1.sql
--     (columns the engine reads: organization_id, profile_id, role, status)
--   * engagement_contexts shape -> the employment-context spine
--   * notification_events (v2 constraint state)
--       -> 20260810070000_notification_events_v1.sql +
--          20260813100000_notification_events_v2_types.sql
--
-- WHAT THIS IS NOT: a full Supabase stack. `auth.uid()` and `is_admin()` are
-- session-GUC stubs so one psql session can act as any actor (the
-- established a1 proof pattern). Definer functions are owned by `postgres`
-- and `relforcerowsecurity` stays false, matching production.
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
  id uuid primary key default gen_random_uuid(),
  email text
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','admin','manager','external_manager','member')),
  status text not null default 'invited' check (status in ('invited','active','revoked'))
);

create table if not exists public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  status text not null default 'active',
  relationship_slug text not null default 'worker'
);

grant select on public.profiles, public.organizations,
                public.company_memberships, public.engagement_contexts
  to authenticated;

-- ── Real helpers, copied verbatim from 20260806120000 ───────────────────────
create or replace function public.membership_actor_role_v1(
  p_actor uuid, p_organization_id uuid
) returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.company_memberships
   where organization_id = p_organization_id
     and profile_id = p_actor
     and status = 'active'
   limit 1
$$;
revoke all on function public.membership_actor_role_v1(uuid, uuid) from public;
revoke all on function public.membership_actor_role_v1(uuid, uuid) from anon;
revoke all on function public.membership_actor_role_v1(uuid, uuid) from authenticated;

create or replace function public.belongs_to_organization(org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = auth.uid()
       and ec.organization_id = org
       and ec.status = 'active'
  )
  or exists (
    select 1 from public.company_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = org
       and m.status = 'active'
  )
$$;
revoke all on function public.belongs_to_organization(uuid) from public;
revoke all on function public.belongs_to_organization(uuid) from anon;
grant execute on function public.belongs_to_organization(uuid) to authenticated;

-- ── notification_events at the v2 constraint state (for the v3 proof) ──────
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null
    constraint notification_events_type_check check (event_type in (
      'booking_proposed',
      'booking_accepted',
      'booking_declined',
      'booking_withdrawn',
      'absence_requested',
      'absence_approved',
      'absence_rejected',
      'engagement_created',
      'engagement_ended'
    )),
  entity_type text not null
    constraint notification_events_entity_type_check check (entity_type in (
      'booking_request',
      'worker_absence',
      'engagement'
    )),
  entity_id uuid not null,
  dedupe_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notification_events_dedupe unique (recipient_profile_id, dedupe_key)
);
