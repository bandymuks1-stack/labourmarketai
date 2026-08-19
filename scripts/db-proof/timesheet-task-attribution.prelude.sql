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

create table public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'todo'
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
