-- Extends the work-tasks-stage-subtask prelude (run AFTER it) with the columns the team spine reads.
alter table public.organizations
  add column owner_profile_id uuid,
  add column organization_type text,
  add column display_name text;
alter table public.profiles add column full_name text;
alter table public.engagement_contexts
  add column created_at timestamptz not null default now(),
  add column started_at date,
  add column ended_at date;
alter table public.projects add column status text not null default 'planned';
grant select on public.organizations, public.profiles, public.engagement_contexts to authenticated;
