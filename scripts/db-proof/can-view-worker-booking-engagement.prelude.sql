-- ============================================================================
-- can_view_worker vs booking engagements — PROOF HARNESS PRELUDE.
--
-- Builds the minimal faithful prerequisites so the REAL files
--   supabase/migrations/20260809120000_can_view_worker_booking_engagement_v1.sql
--   supabase/rollbacks/20260809120000_can_view_worker_booking_engagement_v1.down.sql
-- can be executed VERBATIM against a throwaway Postgres and the resulting
-- per-role authorization measured. Nothing here re-implements them.
--
-- Everything below is copied from the real migrations, not re-invented:
--   * owns_worker / owns_company / owns_agency  -> 0001_initial_schema.sql
--   * is_employer (active_role form)            -> 0003_multi_role.sql
--   * manages_organization                      -> 0013_work_journal_m1.sql
--   * can_manage_project                        -> 20260601091000_project_object_client_context.sql
--   * privacy_consent_purposes / _events DDL,
--     worker_profile_discoverable,
--     can_view_worker (the CURRENT applied body),
--     workers_select / worker_skills_select /
--     worker_professions_select policies         -> 20260711130000_privacy_consent_and_disclosure_v1.sql
--   * worker_languages DDL + worker_languages_select
--                                                -> 20260711250000_worker_languages_v1.sql
--   * company_worker_engagements DDL + its RLS,
--     list_booking_engagement_workers_v1         -> 20260723120000_company_worker_engagements_v1.sql
--   * end_company_worker_engagement_v2           -> 20260804160000_booking_engagement_end_v2.sql
--
-- The starting state this prelude reproduces is PRODUCTION AS OF 2026-08-09:
-- `can_view_worker.prosrc` does not mention `company_worker_engagements`,
-- while the APPLIED `list_booking_engagement_workers_v1` already returns the
-- engaged worker's `display_name` to the engaging company owner. Both facts
-- are measured by the proof (check "PRE-EXISTING DISCLOSURE").
--
-- WHAT THIS IS NOT: a full Supabase stack. `auth.uid()` is a session-GUC stub
-- so one psql session can act as any actor; `is_admin()` and `is_employer()`
-- read the real `profiles` row exactly as production does. Faithful for this
-- proof: all of them are `stable` functions the policies call per row, as in
-- prod. Definer functions are owned by `postgres` and `relforcerowsecurity` is
-- left false, matching production, so definer functions bypass RLS here
-- exactly as they do there.
--
-- Throwaway only. Never point this at production or at a shared local stack.
-- ============================================================================

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon;          end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role;  end if;
end $$;

grant usage on schema public to authenticated, anon, service_role;

create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.uid', true), '')::uuid;
$$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;

-- ── Surrounding spine (minimum shape the FKs + helpers need) ────────────────

-- `active_role` is real: is_admin() and is_employer() both read it in prod.
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  active_role text
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade
);

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade
);

-- Only the identity columns this proof actually reads back. The real table has
-- ~31 columns (enumerated in the migration header); the predicate is
-- row-level, so three representative ones prove the same thing.
create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete cascade,
  display_name text,
  headline text,
  bio text
);

create table if not exists public.company_workers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  worker_id  uuid not null references public.workers(id)   on delete cascade,
  status text not null default 'active'
);

create table if not exists public.agency_workers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  worker_id uuid not null references public.workers(id)  on delete cascade,
  status text not null default 'active'
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  legacy_company_id uuid references public.companies(id) on delete set null
);

create table if not exists public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  status text not null default 'active',
  relationship_slug text not null default 'employee'
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  status text not null default 'live'
);

create table if not exists public.project_worker_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  worker_id  uuid not null references public.workers(id)  on delete cascade,
  status text not null default 'active',
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (project_id, worker_id)
);

-- Skills / professions / languages: the other three tables gated by the
-- predicate. Only the columns the proof reads.
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  slug text unique
);
create table if not exists public.professions (
  id uuid primary key default gen_random_uuid(),
  slug text unique
);
create table if not exists public.worker_skills (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references public.workers(id) on delete cascade,
  skill_id  uuid references public.skills(id)  on delete cascade,
  self_rated_level int,
  verified boolean not null default false,
  unique (worker_id, skill_id)
);
create table if not exists public.worker_professions (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  profession_id uuid not null references public.professions(id) on delete restrict,
  is_primary boolean not null default false,
  unique (worker_id, profession_id)
);
create table if not exists public.worker_languages (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  lang  text not null,
  level text not null,
  unique (worker_id, lang)
);

-- Only the columns the engagement FK needs; the booking body is not exercised.
create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'accepted'
);

-- ── Consent spine (20260711130000, shapes the proof actually reads) ─────────

create table if not exists public.privacy_consent_purposes (
  purpose text primary key,
  current_version text not null,
  current_text_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.privacy_consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null references public.privacy_consent_purposes(purpose),
  action text not null check (action in ('granted','withdrawn')),
  consent_text_version text not null,
  consent_text_hash text not null,
  locale text not null default 'lt',
  source text not null default 'proof',
  created_at timestamptz not null default now()
);

insert into public.privacy_consent_purposes (purpose, current_version, current_text_hash)
values ('profile_discoverability', '2026-07-11.v1', 'hash-v1')
on conflict (purpose) do nothing;

-- ── company_worker_engagements (20260723120000, APPLIED in prod) ────────────

create table if not exists public.company_worker_engagements (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  worker_id         uuid references public.workers(id) on delete set null,
  subject_key       uuid not null default gen_random_uuid(),
  source_booking_id uuid not null references public.booking_requests(id) on delete restrict,
  status            text not null default 'active' check (status in ('active','ended')),
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  ended_by          uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null,
  unique (source_booking_id)
);

create unique index if not exists company_worker_engagements_active_pair_idx
  on public.company_worker_engagements (company_id, worker_id)
  where status = 'active';

-- ── Helper predicates (verbatim from their source migrations) ───────────────

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active_role = 'admin'
  )
$$;

create or replace function public.is_employer() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select active_role from public.profiles where id = auth.uid())
      in ('company','agency'),
    false)
$$;

create or replace function public.owns_worker(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workers x where x.id = w and x.profile_id = auth.uid()
  )
$$;

create or replace function public.owns_company(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies x where x.id = c and x.profile_id = auth.uid()
  )
$$;

create or replace function public.owns_agency(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agencies x where x.id = a and x.profile_id = auth.uid()
  )
$$;

create or replace function public.manages_organization(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = auth.uid()
       and ec.organization_id = org
       and ec.status = 'active'
       and ec.relationship_slug in ('owner','manager')
  )
$$;

create or replace function public.can_manage_project(p_project_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
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

create or replace function public.worker_profile_discoverable(p_profile uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  -- TRUE only when the newest profile_discoverability event is 'granted' AND
  -- was given for the CURRENT consent-text version (stale version => false).
  select coalesce((
    select e.action = 'granted' and e.consent_text_version = p.current_version
    from public.privacy_consent_events e
    join public.privacy_consent_purposes p on p.purpose = e.purpose
    where e.user_id = p_profile
      and e.purpose = 'profile_discoverability'
    order by e.created_at desc, e.id desc
    limit 1
  ), false)
$$;

-- ── THE PREDICATE UNDER TEST — the CURRENT applied body (no engagement) ─────
-- Verbatim from 20260711130000. This is the BEFORE state the proof measures.
create or replace function public.can_view_worker(w uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select
    public.owns_worker(w)
    or public.is_admin()
    or (
      public.is_employer()
      and exists (
        select 1 from public.workers x
        where x.id = w
          and x.profile_id is not null
          and public.worker_profile_discoverable(x.profile_id)
      )
    )
    or exists (
      select 1
      from public.company_workers cw
      join public.companies c on c.id = cw.company_id
      where cw.worker_id = w and cw.status = 'active' and c.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.agency_workers aw
      join public.agencies a on a.id = aw.agency_id
      where aw.worker_id = w and aw.status = 'active' and a.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.engagement_contexts ec
      join public.workers x on x.id = w and x.profile_id = ec.profile_id
      where ec.status = 'active'
        and public.manages_organization(ec.organization_id)
    )
    or exists (
      select 1
      from public.project_worker_assignments pwa
      where pwa.worker_id = w
        and pwa.status = 'active'
        and pwa.ended_at is null
        and public.can_manage_project(pwa.project_id)
    )
$$;

-- ── The four RLS policies gated by it ───────────────────────────────────────

alter table public.workers            enable row level security;
alter table public.worker_skills      enable row level security;
alter table public.worker_professions enable row level security;
alter table public.worker_languages   enable row level security;
alter table public.company_worker_engagements enable row level security;

drop policy if exists workers_select on public.workers;
create policy workers_select
  on public.workers for select
  using (public.can_view_worker(id));

drop policy if exists worker_skills_select on public.worker_skills;
create policy worker_skills_select
  on public.worker_skills for select
  using (public.can_view_worker(worker_id));

drop policy if exists worker_professions_select on public.worker_professions;
create policy worker_professions_select
  on public.worker_professions for select
  using (public.can_view_worker(worker_id));

drop policy if exists worker_languages_select on public.worker_languages;
create policy worker_languages_select
  on public.worker_languages for select
  using (public.can_view_worker(worker_id));

drop policy if exists company_worker_engagements_select on public.company_worker_engagements;
create policy company_worker_engagements_select
  on public.company_worker_engagements for select
  using (
    public.owns_company(company_id)
    or exists (
      select 1 from public.workers w
       where w.id = worker_id and w.profile_id = auth.uid()
    )
    or public.is_admin()
  );

-- ── The already-applied definer disclosure the memo turns on ────────────────
-- Verbatim from 20260723120000. It hands the engaging company owner
-- `display_name` and `profile_id` TODAY, bypassing can_view_worker.
create or replace function public.list_booking_engagement_workers_v1()
returns table (
  engagement_id     uuid,
  worker_id         uuid,
  worker_profile_id uuid,
  display_name      text,
  source_booking_id uuid,
  started_at        timestamptz
)
language sql security definer set search_path = public stable as $$
  select e.id,
         e.worker_id,
         w.profile_id,
         coalesce(nullif(trim(w.display_name), ''),
                  'Kandidatas ' || left(e.worker_id::text, 6)),
         e.source_booking_id,
         e.started_at
    from public.company_worker_engagements e
    join public.companies c on c.id = e.company_id
    join public.workers   w on w.id = e.worker_id
   where e.worker_id is not null
     and e.status = 'active'
     and c.profile_id is not distinct from auth.uid()
   order by e.started_at desc;
$$;

-- ── The revocation path (20260804160000, APPLIED) ───────────────────────────
-- Trimmed to the authority + state transition the proof exercises; the
-- outcome vocabulary and anti-oracle behaviour are preserved.
create or replace function public.end_company_worker_engagement_v2(
  p_engagement_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  e       public.company_worker_engagements%rowtype;
  may_end boolean;
begin
  if uid is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select * into e from public.company_worker_engagements
   where id = p_engagement_id for update;
  if e.id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select public.owns_company(e.company_id)
      or exists (
           select 1 from public.workers w
            where w.id = e.worker_id
              and e.worker_id is not null
              and w.profile_id = uid
         )
    into may_end;
  if not may_end then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if e.status = 'ended' then
    return jsonb_build_object('outcome', 'already_ended');
  end if;

  update public.company_worker_engagements
     set status = 'ended', ended_at = coalesce(ended_at, now()), ended_by = uid
   where id = e.id and status = 'active';

  if not found then
    return jsonb_build_object('outcome', 'conflict');
  end if;
  return jsonb_build_object('outcome', 'ended');
end;
$$;

-- ── Grants: mirror production's posture (authenticated only) ────────────────

grant select on public.workers, public.worker_skills, public.worker_professions,
                public.worker_languages, public.company_worker_engagements,
                public.projects, public.project_worker_assignments
  to authenticated;

revoke all on function public.can_view_worker(uuid) from public;
revoke all on function public.can_view_worker(uuid) from anon;
grant execute on function public.can_view_worker(uuid) to authenticated;

revoke all on function public.worker_profile_discoverable(uuid) from public;
revoke all on function public.worker_profile_discoverable(uuid) from anon;
grant execute on function public.worker_profile_discoverable(uuid) to authenticated;

revoke all on function public.list_booking_engagement_workers_v1() from public;
revoke all on function public.list_booking_engagement_workers_v1() from anon;
grant execute on function public.list_booking_engagement_workers_v1() to authenticated;

revoke all on function public.end_company_worker_engagement_v2(uuid) from public;
revoke all on function public.end_company_worker_engagement_v2(uuid) from anon;
grant execute on function public.end_company_worker_engagement_v2(uuid) to authenticated;

grant execute on function public.owns_worker(uuid), public.owns_company(uuid),
                          public.owns_agency(uuid), public.is_admin(),
                          public.is_employer(), public.manages_organization(uuid),
                          public.can_manage_project(uuid)
  to authenticated;
