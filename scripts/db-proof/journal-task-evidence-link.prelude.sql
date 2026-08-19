-- ===========================================================================
-- RLS PROOF HARNESS for 20260819190000_journal_task_evidence_link_v1
--
-- NOT an invented schema: the helper functions and the journal/work_task RLS
-- predicates below are copied VERBATIM from production
-- (gorgitwvdzxbnaxhrsrw) via pg_get_functiondef / pg_policies. Only the
-- dependency tables are reduced to the columns the predicates and the
-- migration under test actually touch.
--
-- Purpose: exercise the migration against a REAL PostgreSQL server as several
-- distinct users plus anon, because the doctrine-standard local Supabase
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

-- work_tasks — real column set
create table public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id),
  source_type text,
  source_id uuid,
  title text not null,
  description text,
  status text not null default 'todo',
  priority text not null default 'normal',
  assignee_profile_id uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  object_id uuid
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

alter table public.work_tasks enable row level security;
create policy wt_select on public.work_tasks for select
  using (
    ((created_by = auth.uid()) OR (assignee_profile_id = auth.uid()) OR is_admin()
     OR ((project_id IS NOT NULL) AND can_manage_project(project_id)))
  );

-- Reads the app performs alongside the link
alter table public.journal_entry_photos enable row level security;
create policy jep_select on public.journal_entry_photos for select
  using (exists (select 1 from public.journal_entries je where je.id = entry_id));
alter table public.journal_entry_confirmations enable row level security;
create policy jec_select on public.journal_entry_confirmations for select
  using (exists (select 1 from public.journal_entries je where je.id = entry_id));

-- Matches production role_table_grants exactly: authenticated has SELECT on
-- engagement_contexts, photos and confirmations, and NO grant on audit_logs.
grant select on public.journal_entries, public.work_tasks,
  public.journal_entry_photos, public.journal_entry_confirmations,
  public.engagement_contexts, public.profiles, public.workers,
  public.company_memberships, public.projects, public.organizations to authenticated;
grant insert on public.journal_entries to authenticated;
