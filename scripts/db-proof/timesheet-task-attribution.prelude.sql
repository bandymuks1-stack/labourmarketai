-- ===========================================================================
-- Harness for 20260819220000_timesheet_task_attribution_v1.
--
-- Reduced to the tables timesheet_compute_lines_v1 actually reads. Column
-- shapes follow production information_schema. No RLS here: the function is
-- SECURITY DEFINER and the question under test is its ARITHMETIC and its
-- ATTRIBUTION, not its visibility (visibility is proven for the underlying
-- link by scripts/db-proof/journal-task-evidence-link.sh).
-- ===========================================================================

create extension if not exists pgcrypto;

-- Supabase's roles. The migration REVOKEs from them, so they must exist for
-- it to load at all. Created here so this proof runs on a CLEAN cluster
-- rather than silently depending on a sibling proof having made them first.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create table public.organizations (id uuid primary key);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  title text
);
create table public.profiles (id uuid primary key);
create table public.workers (id uuid primary key default gen_random_uuid());
create table public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id)
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null,
  engagement_context_id uuid not null references public.engagement_contexts(id),
  original_text text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  superseded_by uuid,
  correction_of uuid,
  project_id uuid references public.projects(id)
);

create table public.productivity_units (
  slug text primary key,
  category text not null
);
insert into public.productivity_units (slug, category) values
  ('hours','time'), ('minutes','time'), ('days','time'), ('square_meters','area');

create table public.journal_entry_metrics (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  metric_slug text not null,
  value_numeric numeric,
  value_text text,
  unit_slug text,
  source text,
  created_at timestamptz not null default now()
);

-- work_tasks has NO organization_id in production. Its organization is
-- reached through project -> projects.organization_id or through
-- object -> work_objects.organization_id. Both spines are modelled here
-- because the tenant-scope predicate under test reads both.
create table public.work_objects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid references public.projects(id)
);

create table public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'todo',
  project_id uuid references public.projects(id),
  object_id uuid references public.work_objects(id)
);

-- The link this whole slice reads (shipped by 20260819190000, applied).
create table public.journal_entry_tasks (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  task_id uuid not null references public.work_tasks(id) on delete cascade,
  linked_by uuid,
  linked_at timestamptz not null default now(),
  unlinked_by uuid,
  unlinked_at timestamptz,
  unlink_reason text
);
create unique index jet_active_pair_uq
  on public.journal_entry_tasks (entry_id, task_id) where unlinked_at is null;
