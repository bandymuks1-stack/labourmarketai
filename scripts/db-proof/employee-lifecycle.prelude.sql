-- ============================================================================
-- EMPLOYEE LIFECYCLE v1 — PROOF HARNESS PRELUDE.
--
-- Builds the minimal faithful prerequisites so the REAL files
--   supabase/migrations/20260817190000_employee_lifecycle_v1.sql
--   supabase/rollbacks/20260817190000_employee_lifecycle_v1.down.sql
-- can be executed VERBATIM against a throwaway Postgres and the resulting
-- per-role behaviour measured. Nothing here re-implements them.
--
-- Everything below is copied from the real migrations, not re-invented:
--   * manages_organization (dual-arm) -> 20260806180000_membership_authority_widening_v1.sql (verbatim)
--   * end_org_membership_v1 -> 20260802160000_org_membership_revocation_v1.sql (verbatim body)
--   * engagement_contexts shape -> 0013_work_journal_m1.sql + 20260530140000 columns
--   * assets / asset_assignments shape -> 20260718170000_assets_logistics.sql
--   * work_tasks shape (columns the engine reads) -> 20260711210000_work_tasks_v1.sql
--   * document_acknowledgements (columns the engine reads) -> 20260817140000_document_file_layer_v1.sql
--   * company_memberships shape -> 20260806090000_company_memberships_v1.sql
--
-- WHAT THIS IS NOT: a full Supabase stack. `auth.uid()` and `is_admin()` are
-- session-GUC stubs so one psql session can act as any actor (the
-- established a1/workflow proof pattern). Definer functions are owned by
-- `postgres` and `relforcerowsecurity` stays false, matching production.
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

-- ── Surrounding spine (minimum shape the FKs + helpers + RPCs need) ─────────
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text,
  full_name text
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid references public.profiles(id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id)
);

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','admin','manager','external_manager','member')),
  status text not null default 'invited' check (status in ('invited','active','revoked'))
);

-- engagement_contexts EXACTLY as production has it BEFORE this migration
-- (0013 base + 20260530140000 operations columns) — the migration under
-- test ALTERs this table, which is part of what is being proven.
create table if not exists public.engagement_contexts (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  organization_id   uuid references public.organizations(id) on delete set null,
  project_id        uuid references public.projects(id) on delete set null,
  relationship_slug text not null,
  country_code      text,
  status            text not null default 'active' check (status in ('active','paused','ended')),
  started_at        date,
  ended_at          date,
  title             text,
  description       text,
  is_primary        boolean not null default false,
  hash_prev         text,
  hash_self         text not null default 'x',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  operations_role   text,
  journal_review_enabled boolean not null default false
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text,
  entity text,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);
grant insert on public.audit_logs to authenticated;

-- assets engine shape (20260718170000) — columns the lifecycle engine reads.
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_type text not null default 'tool',
  name text not null,
  condition text not null default 'unknown',
  availability text not null default 'available',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.asset_assignments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  project_id uuid,
  worker_id uuid references public.workers(id) on delete set null,
  status text not null default 'issued'
    check (status in ('issued','acknowledged','transferred','returned')),
  condition_at_issue text not null default 'unknown',
  condition_at_return text,
  note text,
  issued_by uuid,
  issued_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- work_tasks shape (20260711210000) — columns the lifecycle engine reads.
create table if not exists public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'task',
  status text not null default 'todo'
    check (status in ('todo','in_progress','blocked','done','cancelled')),
  assignee_profile_id uuid references public.profiles(id),
  created_by uuid,
  created_at timestamptz not null default now()
);

-- document_acknowledgements shape (20260817140000) — columns the lifecycle
-- engine reads.
create table if not exists public.document_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  assignee_profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz not null default now()
);

grant select on public.profiles, public.organizations, public.workers,
                public.company_memberships, public.engagement_contexts,
                public.assets, public.asset_assignments, public.work_tasks,
                public.document_acknowledgements, public.audit_logs
  to authenticated;

-- ── Real helper, copied verbatim from 20260806180000 ────────────────────────
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

-- ── Real canonical end path, copied verbatim from 20260802160000 ────────────
create or replace function public.end_org_membership_v1(
  p_engagement_id uuid,
  p_reason        text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  v_profile    uuid;
  v_org        uuid;
  v_slug       text;
  v_status     text;
  v_org_owner  uuid;
  v_capacity   text;
  v_reason     text := nullif(trim(coalesce(p_reason, '')), '');
  v_other_owners int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_engagement_id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    v_reason := left(v_reason, 500);
  end if;

  select ec.profile_id, ec.organization_id, ec.relationship_slug, ec.status
    into v_profile, v_org, v_slug, v_status
    from public.engagement_contexts ec
   where ec.id = p_engagement_id;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_org is null then
    return jsonb_build_object('outcome', 'not_org_scoped');
  end if;

  select o.owner_profile_id into v_org_owner
    from public.organizations o where o.id = v_org;

  if public.is_admin() then
    v_capacity := 'admin';
  elsif v_org_owner is not null and v_org_owner = uid then
    v_capacity := 'owner';
  elsif public.manages_organization(v_org)
        and v_slug not in ('owner', 'manager', 'external_manager') then
    v_capacity := 'manager';
  elsif v_profile = uid then
    v_capacity := 'self';
  else
    if public.manages_organization(v_org) or v_profile = uid then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_org_owner is not null and v_profile = v_org_owner then
    return jsonb_build_object('outcome', 'last_owner');
  end if;
  if v_slug = 'owner' then
    select count(*) into v_other_owners
      from public.engagement_contexts ec
     where ec.organization_id = v_org
       and ec.relationship_slug = 'owner'
       and ec.status = 'active'
       and ec.id <> p_engagement_id;
    if v_other_owners = 0 then
      return jsonb_build_object('outcome', 'last_owner');
    end if;
  end if;

  if v_status = 'ended' then
    return jsonb_build_object(
      'outcome', 'already_ended',
      'engagement_id', p_engagement_id,
      'organization_id', v_org,
      'profile_id', v_profile,
      'from_role', v_slug,
      'to_role', 'ended');
  end if;

  update public.engagement_contexts
     set status                 = 'ended',
         ended_at               = coalesce(ended_at, current_date),
         journal_review_enabled = false,
         is_primary             = false,
         updated_at             = now()
   where id = p_engagement_id
     and status <> 'ended';

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (
    uid,
    'end_org_membership',
    'engagement_contexts',
    p_engagement_id,
    jsonb_build_object(
      'organization_id', v_org,
      'profile_id',      v_profile,
      'from_role',       v_slug,
      'to_role',         'ended',
      'from_status',     v_status,
      'to_status',       'ended',
      'actor_capacity',  v_capacity,
      'self_initiated',  (v_profile = uid),
      'reason',          v_reason
    ));

  return jsonb_build_object(
    'outcome', 'ended',
    'engagement_id', p_engagement_id,
    'organization_id', v_org,
    'profile_id', v_profile,
    'from_role', v_slug,
    'to_role', 'ended');
end $$;

revoke all on function public.end_org_membership_v1(uuid, text) from public;
revoke all on function public.end_org_membership_v1(uuid, text) from anon;
grant execute on function public.end_org_membership_v1(uuid, text) to authenticated;
