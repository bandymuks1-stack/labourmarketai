-- ════════════════════════════════════════════════════════════════════════
-- 0001_initial_schema.sql — M0 initial schema (brief §5)
--
-- Convention (brief §5): every table has `id uuid pk default gen_random_uuid()`
-- (except profiles, whose id IS the auth.users id, and agency_workers, whose
-- pk is composite), `created_at`, `updated_at`, and RLS enabled.
--
-- The full RLS policy rationale (who can SELECT/INSERT/UPDATE/DELETE and under
-- what condition, per table) is documented in docs/DATA_MODEL.md — that file's
-- RLS section is the authoritative explanation of everything below.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ── shared trigger: keep updated_at fresh ───────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── RLS helpers ─────────────────────────────────────────────────────────
-- SECURITY DEFINER so they bypass RLS internally — this is what prevents
-- infinite recursion when a policy on `profiles` needs the caller's role.
create or replace function public.profile_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
$$;

create or replace function public.is_employer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) in ('company','agency'),
    false)
$$;

create or replace function public.owns_worker(w uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workers x where x.id = w and x.profile_id = auth.uid()
  )
$$;

create or replace function public.owns_company(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies x where x.id = c and x.profile_id = auth.uid()
  )
$$;

create or replace function public.owns_agency(a uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agencies x where x.id = a and x.profile_id = auth.uid()
  )
$$;

-- caller is the worker on the match, OR the company that owns its job demand
create or replace function public.can_access_match(m uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.matches mt
    join public.workers w        on w.id  = mt.worker_id
    join public.job_demands jd   on jd.id = mt.job_demand_id
    join public.projects p       on p.id  = jd.project_id
    join public.companies co     on co.id = p.company_id
    where mt.id = m
      and (w.profile_id = auth.uid() or co.profile_id = auth.uid())
  )
$$;

create or replace function public.can_access_thread(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.threads th
    where th.id = t and public.can_access_match(th.match_id)
  )
$$;

-- ════════════════════════════════════════════════════════════════════════
-- TABLES
-- ════════════════════════════════════════════════════════════════════════

-- profiles: extends Supabase auth.users (id == auth.users.id)
create table public.profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  role                    text check (role in ('worker','company','agency','admin')),
  locale                  text not null default 'lt',
  full_name               text,
  email                   text,
  phone                   text,
  country                 text,                       -- ISO 3166-1 alpha-2
  onboarded               boolean not null default false,
  consent_marketing       boolean not null default false,
  consent_data_processing boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- workers: a worker's discoverable avatar
create table public.workers (
  id                       uuid primary key default gen_random_uuid(),
  profile_id               uuid unique references public.profiles(id) on delete cascade,
  display_name             text,
  headline                 text,                      -- "Steel fixer • 10y exp"
  bio                      text,
  experience_years         int,
  current_location_country text,
  preferred_countries      text[],                    -- ['NL','DK','DE']
  availability_status      text check (availability_status in ('available','busy','unavailable')),
  available_from           date,
  salary_min_eur           int,
  salary_max_eur           int,
  trust_score              int not null default 0,    -- 0–100
  profile_completeness     int not null default 0,    -- 0–100
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- skills: master list, seeded by admin (reference-data.sql)
create table public.skills (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique,
  category   text,                                    -- 'construction.steel', ...
  name_lt    text,
  name_en    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- countries: reference lookup for the text country codes used across the
-- schema (profiles.country, workers.preferred_countries, etc.). NOT a §5
-- core entity — added to satisfy the §10.2 reference-data requirement of
-- loaded country rows for target markets. Decision recorded for ADR (slice 7).
create table public.countries (
  code       text primary key,                        -- ISO 3166-1 alpha-2
  name_lt    text not null,
  name_en    text not null,
  is_target_market boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- worker_skills: junction with evidence
create table public.worker_skills (
  id               uuid primary key default gen_random_uuid(),
  worker_id        uuid references public.workers(id) on delete cascade,
  skill_id         uuid references public.skills(id) on delete cascade,
  self_rated_level int check (self_rated_level between 1 and 5),
  verified         boolean not null default false,
  verified_by      uuid references public.profiles(id),
  verified_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (worker_id, skill_id)
);

-- companies
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.profiles(id) on delete set null,  -- owner
  legal_name  text,
  display_name text,
  country     text,
  vat_number  text,
  trust_score int not null default 0,
  description text,
  website     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- agencies
create table public.agencies (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.profiles(id) on delete set null,
  legal_name  text,
  country     text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- agency_workers: workers managed by an agency (composite pk per §5)
create table public.agency_workers (
  agency_id  uuid references public.agencies(id) on delete cascade,
  worker_id  uuid references public.workers(id) on delete cascade,
  status     text check (status in ('active','paused','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (agency_id, worker_id)
);

-- projects: company projects
create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies(id) on delete cascade,
  title           text,
  country         text,
  city            text,
  start_date      date,
  end_date        date,
  housing_provided boolean,
  status          text check (status in ('draft','live','paused','closed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- job_demands: specific role openings within a project
create table public.job_demands (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid references public.projects(id) on delete cascade,
  role_title         text,
  headcount_needed   int,
  required_skills    uuid[],                           -- references skills.id
  preferred_countries text[],
  salary_offered_eur int,
  start_date         date,
  status             text check (status in ('open','paused','filled','closed')),
  visibility         text check (visibility in ('public','agencies_only','direct_only')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- matches: produced by the matching algorithm (written via service role)
create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  worker_id     uuid references public.workers(id) on delete cascade,
  job_demand_id uuid references public.job_demands(id) on delete cascade,
  score         numeric(5,2),                          -- 0.00–100.00
  reasons       jsonb,                                 -- explainability payload
  computed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (worker_id, job_demand_id)
);

-- match_actions: who did what with which match
create table public.match_actions (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid references public.matches(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text check (action in ('view','like','skip','request_contact','invite','accept','decline')),
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- threads + messages
create table public.threads (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid references public.matches(id) on delete cascade,
  status     text check (status in ('open','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid references public.threads(id) on delete cascade,
  sender_id  uuid references public.profiles(id) on delete set null,
  body       text,
  sent_at    timestamptz not null default now(),
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- consents: GDPR audit trail
create table public.consents (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid references public.profiles(id) on delete cascade,
  consent_type text,                                   -- 'marketing','data_processing','share_with_agency'
  granted      boolean,
  granted_at   timestamptz,
  revoked_at   timestamptz,
  source       text,                                   -- 'signup','settings','migration'
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- leads: sales pipeline (admin / service-role writes)
create table public.leads (
  id           uuid primary key default gen_random_uuid(),
  source       text,                                   -- 'landing_cta','signup_incomplete','demo_request'
  email        text,
  full_name    text,
  company_name text,
  country      text,
  intent       text check (intent in ('hire_workers','find_job','partner','unknown')),
  status       text check (status in ('new','contacted','qualified','won','lost')),
  notes        text,
  assigned_to  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- plans + subscriptions
create table public.plans (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique,                       -- 'free','business','agency','enterprise'
  name_lt           text,
  name_en           text,
  price_eur_monthly int,                               -- NULL until founder sets pricing
  features          jsonb,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid references public.profiles(id) on delete cascade,
  plan_id            uuid references public.plans(id) on delete set null,
  status             text check (status in ('trial','active','past_due','canceled')),
  started_at         timestamptz,
  current_period_end timestamptz,
  external_ref       text,                             -- Stripe/Montonio id
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- audit_logs (append-only; service-role writes)
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text,
  entity      text,
  entity_id   uuid,
  payload     jsonb,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── updated_at triggers (every table) ───────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','workers','skills','countries','worker_skills','companies',
    'agencies','agency_workers','projects','job_demands','matches',
    'match_actions','threads','messages','consents','leads','plans',
    'subscriptions','audit_logs'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ── auto-create a profile row on auth signup ────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role, locale)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data->>'role', ''),
    coalesce(nullif(new.raw_user_meta_data->>'locale',''), 'lt')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY  (rationale: docs/DATA_MODEL.md → "RLS")
-- Default posture: RLS enabled on every table, deny-by-default; the policies
-- below grant the minimum. The service_role key bypasses RLS entirely — the
-- matching engine, billing webhooks, lead capture and audit writes run as
-- service role and intentionally have no user-facing write policy.
-- ════════════════════════════════════════════════════════════════════════
alter table public.profiles       enable row level security;
alter table public.workers        enable row level security;
alter table public.skills         enable row level security;
alter table public.countries      enable row level security;
alter table public.worker_skills  enable row level security;
alter table public.companies      enable row level security;
alter table public.agencies       enable row level security;
alter table public.agency_workers enable row level security;
alter table public.projects       enable row level security;
alter table public.job_demands    enable row level security;
alter table public.matches        enable row level security;
alter table public.match_actions  enable row level security;
alter table public.threads        enable row level security;
alter table public.messages       enable row level security;
alter table public.consents       enable row level security;
alter table public.leads          enable row level security;
alter table public.plans          enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.audit_logs     enable row level security;

-- ── profiles: self + admin ──────────────────────────────────────────────
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy profiles_insert on public.profiles for insert
  with check (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy profiles_delete on public.profiles for delete
  using (public.is_admin());

-- ── workers: self + admin; employers may browse the directory ───────────
create policy workers_select on public.workers for select
  using (profile_id = auth.uid() or public.is_admin() or public.is_employer());
create policy workers_insert on public.workers for insert
  with check ((profile_id = auth.uid() and public.profile_role() = 'worker')
              or public.is_admin());
create policy workers_update on public.workers for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
create policy workers_delete on public.workers for delete
  using (profile_id = auth.uid() or public.is_admin());

-- ── skills: public read; admin write ────────────────────────────────────
create policy skills_select on public.skills for select using (true);
create policy skills_write_admin on public.skills for all
  using (public.is_admin()) with check (public.is_admin());

-- ── countries: public read; admin write ─────────────────────────────────
create policy countries_select on public.countries for select using (true);
create policy countries_write_admin on public.countries for all
  using (public.is_admin()) with check (public.is_admin());

-- ── worker_skills: owning worker + admin; employers read ────────────────
create policy worker_skills_select on public.worker_skills for select
  using (public.owns_worker(worker_id) or public.is_admin() or public.is_employer());
create policy worker_skills_write on public.worker_skills for all
  using (public.owns_worker(worker_id) or public.is_admin())
  with check (public.owns_worker(worker_id) or public.is_admin());

-- ── companies: owner + admin; authenticated users may read ──────────────
create policy companies_select on public.companies for select
  using (auth.uid() is not null);
create policy companies_insert on public.companies for insert
  with check ((profile_id = auth.uid() and public.profile_role() = 'company')
              or public.is_admin());
create policy companies_update on public.companies for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
create policy companies_delete on public.companies for delete
  using (profile_id = auth.uid() or public.is_admin());

-- ── agencies: owner + admin; authenticated users may read ───────────────
create policy agencies_select on public.agencies for select
  using (auth.uid() is not null);
create policy agencies_insert on public.agencies for insert
  with check ((profile_id = auth.uid() and public.profile_role() = 'agency')
              or public.is_admin());
create policy agencies_update on public.agencies for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
create policy agencies_delete on public.agencies for delete
  using (profile_id = auth.uid() or public.is_admin());

-- ── agency_workers: agency owner + the worker + admin ───────────────────
create policy agency_workers_select on public.agency_workers for select
  using (public.owns_agency(agency_id) or public.owns_worker(worker_id)
         or public.is_admin());
create policy agency_workers_write on public.agency_workers for all
  using (public.owns_agency(agency_id) or public.is_admin())
  with check (public.owns_agency(agency_id) or public.is_admin());

-- ── projects: owning company + admin; live projects are visible ─────────
create policy projects_select on public.projects for select
  using (public.owns_company(company_id) or public.is_admin()
         or (status = 'live' and auth.uid() is not null));
create policy projects_insert on public.projects for insert
  with check (public.owns_company(company_id) or public.is_admin());
create policy projects_update on public.projects for update
  using (public.owns_company(company_id) or public.is_admin())
  with check (public.owns_company(company_id) or public.is_admin());
create policy projects_delete on public.projects for delete
  using (public.owns_company(company_id) or public.is_admin());

-- ── job_demands: owning company + admin; visibility-gated browse ────────
create policy job_demands_select on public.job_demands for select
  using (
    public.is_admin()
    or exists (select 1 from public.projects p
               where p.id = project_id and public.owns_company(p.company_id))
    or (status = 'open' and auth.uid() is not null and (
          visibility = 'public'
          or (visibility = 'agencies_only' and public.profile_role() = 'agency')))
  );
create policy job_demands_write on public.job_demands for all
  using (
    public.is_admin()
    or exists (select 1 from public.projects p
               where p.id = project_id and public.owns_company(p.company_id))
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.projects p
               where p.id = project_id and public.owns_company(p.company_id))
  );

-- ── matches: the worker, the hiring company, admin (write = service role)
create policy matches_select on public.matches for select
  using (public.can_access_match(id) or public.is_admin());
create policy matches_admin_write on public.matches for all
  using (public.is_admin()) with check (public.is_admin());

-- ── match_actions: participants read; you record only your own action ───
create policy match_actions_select on public.match_actions for select
  using (public.can_access_match(match_id) or public.is_admin());
create policy match_actions_insert on public.match_actions for insert
  with check (actor_id = auth.uid() and public.can_access_match(match_id));
create policy match_actions_admin on public.match_actions for all
  using (public.is_admin()) with check (public.is_admin());

-- ── threads: match participants + admin ─────────────────────────────────
create policy threads_select on public.threads for select
  using (public.can_access_match(match_id) or public.is_admin());
create policy threads_insert on public.threads for insert
  with check (public.can_access_match(match_id) or public.is_admin());
create policy threads_update on public.threads for update
  using (public.can_access_match(match_id) or public.is_admin())
  with check (public.can_access_match(match_id) or public.is_admin());
create policy threads_delete on public.threads for delete
  using (public.is_admin());

-- ── messages: thread participants; sender writes own ────────────────────
create policy messages_select on public.messages for select
  using (public.can_access_thread(thread_id) or public.is_admin());
create policy messages_insert on public.messages for insert
  with check (sender_id = auth.uid() and public.can_access_thread(thread_id));
create policy messages_update on public.messages for update
  using (public.can_access_thread(thread_id) or public.is_admin())
  with check (public.can_access_thread(thread_id) or public.is_admin());
create policy messages_delete on public.messages for delete
  using (public.is_admin());

-- ── consents: own + admin; never hard-deleted except by admin ───────────
create policy consents_select on public.consents for select
  using (profile_id = auth.uid() or public.is_admin());
create policy consents_insert on public.consents for insert
  with check (profile_id = auth.uid() or public.is_admin());
create policy consents_update on public.consents for update
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
create policy consents_delete on public.consents for delete
  using (public.is_admin());

-- ── leads: admin only (public capture goes through service role) ────────
create policy leads_admin on public.leads for all
  using (public.is_admin()) with check (public.is_admin());

-- ── plans: public read; admin write ─────────────────────────────────────
create policy plans_select on public.plans for select using (true);
create policy plans_write_admin on public.plans for all
  using (public.is_admin()) with check (public.is_admin());

-- ── subscriptions: own read; admin manages (billing = service role) ─────
create policy subscriptions_select on public.subscriptions for select
  using (profile_id = auth.uid() or public.is_admin());
create policy subscriptions_admin on public.subscriptions for all
  using (public.is_admin()) with check (public.is_admin());

-- ── audit_logs: admin reads; append-only (no update/delete policy) ──────
create policy audit_logs_select on public.audit_logs for select
  using (public.is_admin());
create policy audit_logs_insert on public.audit_logs for insert
  with check (public.is_admin());
