-- Columns/tables the slice-2 read doors touch (reduced; production shapes).
alter table public.organizations add column if not exists name text;
alter table public.workers add column if not exists display_name text;
alter table public.projects add column if not exists name text;
alter table public.engagement_contexts add column if not exists created_at timestamptz not null default now();
alter table public.engagement_contexts add column if not exists started_at date;
alter table public.engagement_contexts add column if not exists ended_at date;
create table public.journal_entry_metrics (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  metric_slug text not null, value_numeric numeric, value_text text, unit_slug text,
  source text not null default 'worker_input', created_at timestamptz not null default now());
create table public.journal_entry_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  file_name text not null, storage_path text not null unique,
  upload_status text not null default 'uploaded', created_at timestamptz not null default now());
