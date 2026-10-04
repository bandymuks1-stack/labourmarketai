-- Extends commitment-override-receipts-v1.prelude.sql (run AFTER it) with just what the team spine
-- (20261003150600_brigade_work_assignment_v1) reads. work_objects / work_tasks / audit_logs are
-- reduced stubs: this proof is about the receipt basis, not about work objects or tasks.
alter table public.organizations
  add column owner_profile_id uuid,
  add column organization_type text,
  add column display_name text;
alter table public.profiles add column full_name text;
alter table public.engagement_contexts
  add column created_at timestamptz not null default now(),
  add column started_at date,
  add column ended_at date;
create table public.work_objects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid, project_id uuid, status text not null default 'active', name text);
create table public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  status text not null default 'todo', title text);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid, action text, entity text, entity_id uuid, payload jsonb);
grant select on public.organizations, public.profiles, public.engagement_contexts to authenticated;
