-- Extends work-tasks-stage-subtask.prelude + team-assignment-canonical.prelude2 (run AFTER both) with the
-- demand / skills / languages / invitations / team_details shapes team_demand_offer_v1 reads. Column names and
-- types follow the real migrations (0028, 20260806200000, 20260711250000, 20260716130000, 20260712200000).
alter table public.companies
  add column profile_id uuid,
  add column verification_status text,
  add column legal_name text,
  add column display_name text;

create table public.customer_requests (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id),
  organization_id   uuid references public.organizations(id),
  title             text not null,
  role_or_work_type text,
  country           text,
  team_size         integer,
  start_period      text,
  status            text not null default 'draft',
  kind              text,
  payload           jsonb,
  created_at        timestamptz not null default now()
);

create table public.skills (id uuid primary key default gen_random_uuid(), slug text not null unique);
create table public.worker_skills (
  worker_id uuid not null references public.workers(id),
  skill_id  uuid not null references public.skills(id),
  verified  boolean not null default false
);
create table public.worker_languages (
  worker_id uuid not null references public.workers(id),
  lang      text not null,
  level     text not null
);
create table public.team_details (
  org_id                uuid primary key references public.organizations(id) on delete cascade,
  availability_status   text not null default 'not_available',
  available_from        date,
  deployable_size_min   integer,
  deployable_size_max   integer,
  destination_countries text[],
  accommodation_needed  boolean not null default false,
  transport_own         boolean not null default false,
  updated_at            timestamptz not null default now()
);
create table public.invitations (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid,
  invitation_type         text,
  status                  text,
  accepted_by_profile_id  uuid
);
-- Like production: no table privileges for the API roles on these (reads go through RPCs / policies).
revoke all on public.customer_requests, public.skills, public.worker_skills, public.worker_languages,
              public.team_details, public.invitations, public.companies from public, anon, authenticated;
