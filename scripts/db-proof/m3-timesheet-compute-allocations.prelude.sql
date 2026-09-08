-- ===========================================================================
-- Harness for 20260831170000_timesheet_compute_allocations_v1.
--
-- Extends the timesheet-task-attribution prelude with the ONE table the new
-- body reads on top of it: work_hour_allocations (shape faithful to the
-- applied 20260829140000, ledger 20260831161725), plus a `name` column on
-- work_objects (production has it NOT NULL; the older prelude did not read
-- it). Column shapes follow production information_schema. No RLS here: the
-- function is SECURITY DEFINER and the question under test is its ARITHMETIC,
-- its DEDUPE and its TENANT FILTERS, not row visibility (visibility of the
-- underlying table is proven by the 20260829140000 production probes recorded
-- in docs/APPLIED_LEDGER.md).
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
-- object -> work_objects.organization_id (NOT NULL there). Both spines are
-- modelled here because the tenant-scope predicate under test reads both.
-- `name` is read by the NEW body (object titles on allocation lines).
create table public.work_objects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid references public.projects(id),
  name text not null default ''
);

create table public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'todo',
  project_id uuid references public.projects(id),
  object_id uuid references public.work_objects(id)
);

-- The link 20260819220000 reads (shipped by 20260819190000, applied).
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

-- The canonical hour FACT (applied 20260829140000, ledger 20260831161725) —
-- the table the NEW body aggregates from.
create table public.work_hour_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  worker_id uuid not null references public.workers (id) on delete restrict,
  entered_by uuid not null references public.profiles (id) on delete restrict,
  work_date date not null,
  work_object_id uuid not null references public.work_objects (id) on delete restrict,
  hours_numeric numeric(5, 2) not null,
  note text,
  source text not null default 'manual',
  status text not null default 'recorded',
  journal_entry_id uuid references public.journal_entries (id) on delete set null,
  correction_of uuid references public.work_hour_allocations (id) on delete set null,
  superseded_by uuid references public.work_hour_allocations (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_hour_allocations_hours_sane
    check (hours_numeric > 0 and hours_numeric <= 24),
  constraint work_hour_allocations_status_known
    check (status in ('recorded', 'submitted', 'approved', 'rejected')),
  constraint work_hour_allocations_not_self_referential
    check (correction_of is null or correction_of <> id),
  constraint work_hour_allocations_not_self_superseding
    check (superseded_by is null or superseded_by <> id)
);
