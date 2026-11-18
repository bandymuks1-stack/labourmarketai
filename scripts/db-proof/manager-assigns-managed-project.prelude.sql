-- Prelude for work-tasks-stage-subtask proof: Supabase roles/auth.uid + reduced external tables + helper
-- functions copied verbatim from the journal-task-evidence-link prelude. work_tasks / project_stages /
-- work_objects / journal_entry_tasks are NOT stubbed: the real migrations create them.
-- stack cannot start here (container image CDN blocked by egress policy).
-- ===========================================================================

create extension if not exists pgcrypto;

-- Supabase roles
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- auth.uid() — the Supabase contract: the JWT `sub` claim for this request.
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated, service_role;

-- ── Dependency tables (reduced to what the real predicates touch) ──────────
create table public.profiles (
  id uuid primary key,
  active_role text
);
create table public.profile_roles (
  profile_id uuid references public.profiles(id),
  role text
);
create table public.organizations (id uuid primary key);
create table public.companies (id uuid primary key, owner_profile_id uuid);
create table public.workers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id)
);
create table public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  organization_id uuid references public.organizations(id),
  status text,
  relationship_slug text
);
create table public.company_memberships (
  profile_id uuid references public.profiles(id),
  organization_id uuid references public.organizations(id),
  status text,
  role text
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  organization_id uuid references public.organizations(id)
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text,
  entity text,
  entity_id uuid,
  payload jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- journal_entries — real column set (production information_schema)
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id),
  engagement_context_id uuid not null references public.engagement_contexts(id),
  entry_type_slug text not null default 'freeform',
  profession_id uuid,
  original_text text not null,
  original_language char(2) not null default 'lt',
  hash_prev text,
  hash_self text not null,
  visibility_scope text not null default 'closed',
  superseded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  correction_of uuid,
  project_id uuid references public.projects(id)
);
create table public.journal_entry_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  profile_id uuid,
  file_name text not null default 'p.jpg',
  mime_type text not null default 'image/jpeg',
  file_size_bytes bigint not null default 1,
  storage_path text not null default 'x',
  upload_status text not null default 'ready',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.journal_entry_confirmations (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  confirmer_id uuid not null,
  confirmer_engagement_context_id uuid not null,
  confirmer_role text not null default 'manager',
  confirmation_scope jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── Helper functions — VERBATIM from production ───────────────────────────
create or replace function public.owns_company(c uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.companies x where x.id = c and x.owner_profile_id = auth.uid());
$$;

create or replace function public.owns_worker(w uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.workers x where x.id = w and x.profile_id = auth.uid()
  )
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active_role = 'admin')
  or exists (select 1 from public.profile_roles where profile_id = auth.uid() and role = 'admin')
$$;

create or replace function public.manages_organization(org uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
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

create or replace function public.can_manage_project(p_project_id uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
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

-- ── Real RLS on the dependency tables (verbatim predicates) ───────────────
alter table public.journal_entries enable row level security;
create policy journal_entries_select on public.journal_entries for select
  using (
    owns_worker(worker_id) OR is_admin() OR (EXISTS ( SELECT 1
       FROM engagement_contexts ec
      WHERE ((ec.id = journal_entries.engagement_context_id) AND manages_organization(ec.organization_id))))
  );
create policy journal_entries_insert on public.journal_entries for insert
  with check ((owns_worker(worker_id) AND (visibility_scope = 'closed'::text)));


create table public.project_worker_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  status text not null default 'active'
);
grant select on public.journal_entries, public.journal_entry_photos,
  public.journal_entry_confirmations, public.engagement_contexts, public.profiles,
  public.workers, public.company_memberships, public.projects, public.organizations,
  public.project_worker_assignments to authenticated;

-- has_org_demand_access: external to this migration (20260806200000); same predicate as production.
create or replace function public.has_org_demand_access(org uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.company_memberships m
    where m.profile_id = auth.uid() and m.organization_id = org and m.status = 'active'
      and m.role in ('owner','admin','manager','external_manager'))
$$;

-- set_updated_at: generic trigger helper defined in an early production migration.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- caller_manages_worker: external (20260808150000). Stubbed to FALSE: this proof does not
-- exercise the agency-management leg of work_task_assignee_eligible_v1.
create or replace function public.caller_manages_worker(w uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$ select false $$;
