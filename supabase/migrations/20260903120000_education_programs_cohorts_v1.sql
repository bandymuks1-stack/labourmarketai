-- 20260903120000_education_programs_cohorts_v1
--
-- ██ RED CLASS — human gate (migration-safety: new tables + GRANT, SECURITY
-- ██ DEFINER functions). Draft; owner-channel apply only.
--
-- EDUCATION FIRST VALUE (FIRST REAL ECOSYSTEM USE, P0H / Track C slice 2).
--
-- The institution → programme → cohort → learner chain, on the canonical
-- organisation model, WITHOUT a generic LMS:
--   * an education institution is an organisation with the `training_provider`
--     capability (organization_roles) — unchanged;
--   * a PROGRAMME is what the institution teaches, pointed at a labour-market
--     direction (`target_profession_slug`, the same registry the match engine
--     and the public vacancy pool use) — that pointer is what turns learning
--     evidence into labour-market relevance;
--   * a COHORT is a bounded group of learners inside a programme (a class, an
--     intake, a group);
--   * a MEMBER is a learner the institution assigns to a cohort AFTER the
--     learner accepted the institution's invitation (the `student` engagement
--     context, institution↔learner link v1). No learner data is copied here —
--     membership is a (cohort, profile) pair; the learner's own records stay
--     under the learner-visibility least-privilege ruling (2026-08-27).
--
-- Plus ONE public read the demand cards need: active public vacancies per
-- profession (anon-safe, same boundary as count_public_vacancies_v1), so an
-- institution sees REAL demand for the directions it teaches and an agency
-- sees what the market asks for — never an empty marketplace.
--
-- Reversible: see the ROLLBACK block and supabase/rollbacks/<same name>.down.sql
-- (guarded — refuses while any programme/cohort/member row exists).

-- ── 1. Tables ────────────────────────────────────────────────────────────────

create table if not exists public.education_programs (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  name                   text not null check (char_length(name) between 2 and 160),
  target_profession_slug text references public.professions(slug) on update cascade,
  education_type_slug    text references public.education_types(slug) on update cascade,
  description            text check (description is null or char_length(description) <= 2000),
  created_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  archived_at            timestamptz
);
create index if not exists education_programs_org_idx on public.education_programs (organization_id);
comment on table public.education_programs is
  'What an education institution (training_provider organisation) teaches, pointed at a labour-market direction via target_profession_slug. Not an LMS: no content, no grades.';

create table if not exists public.education_cohorts (
  id              uuid primary key default gen_random_uuid(),
  program_id      uuid not null references public.education_programs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 120),
  starts_on       date,
  ends_on         date check (ends_on is null or starts_on is null or ends_on >= starts_on),
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  archived_at     timestamptz
);
create index if not exists education_cohorts_program_idx on public.education_cohorts (program_id);
create index if not exists education_cohorts_org_idx on public.education_cohorts (organization_id);
comment on table public.education_cohorts is
  'A bounded learner group inside a programme (class / intake). organization_id is denormalised for RLS.';

create table if not exists public.education_cohort_members (
  cohort_id  uuid not null references public.education_cohorts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'active' check (status in ('active', 'left')),
  added_by   uuid references public.profiles(id) on delete set null,
  added_at   timestamptz not null default now(),
  left_at    timestamptz,
  primary key (cohort_id, profile_id)
);
create index if not exists education_cohort_members_profile_idx on public.education_cohort_members (profile_id);
comment on table public.education_cohort_members is
  'Learner ↔ cohort membership: a (cohort, profile) pair only. The learner must hold an active student engagement context on the cohort''s organisation. No learner data is copied here.';

-- ── 2. RLS ───────────────────────────────────────────────────────────────────

alter table public.education_programs enable row level security;
alter table public.education_cohorts enable row level security;
alter table public.education_cohort_members enable row level security;

-- Managers of the organisation read everything of theirs; a learner reads the
-- programme / cohort they are a member of (their own membership rows only).
create policy education_programs_select on public.education_programs for select
  using (
    public.manages_organization(organization_id)
    or exists (
      select 1 from public.education_cohorts c
      join public.education_cohort_members m on m.cohort_id = c.id
      where c.program_id = education_programs.id and m.profile_id = auth.uid() and m.status = 'active'
    )
    or public.is_admin()
  );

create policy education_cohorts_select on public.education_cohorts for select
  using (
    public.manages_organization(organization_id)
    or exists (
      select 1 from public.education_cohort_members m
      where m.cohort_id = education_cohorts.id and m.profile_id = auth.uid() and m.status = 'active'
    )
    or public.is_admin()
  );

create policy education_cohort_members_select on public.education_cohort_members for select
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.education_cohorts c
      where c.id = education_cohort_members.cohort_id and public.manages_organization(c.organization_id)
    )
    or public.is_admin()
  );

-- Writes go through the three SECURITY DEFINER commands below (no direct
-- INSERT/UPDATE policies), so every rule is checked in one place.
grant select on public.education_programs to authenticated;
grant select on public.education_cohorts to authenticated;
grant select on public.education_cohort_members to authenticated;

-- ── 3. Commands ──────────────────────────────────────────────────────────────

create or replace function public.create_education_program_v1(
  p_organization_id uuid,
  p_name text,
  p_target_profession_slug text default null,
  p_education_type_slug text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if not public.manages_organization(p_organization_id) then
    raise exception 'not_manager' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_roles r
    where r.organization_id = p_organization_id and r.role_slug = 'training_provider'
  ) then
    raise exception 'not_education_institution' using errcode = '42501';
  end if;
  if p_target_profession_slug is not null
     and not exists (select 1 from public.professions p where p.slug = p_target_profession_slug and p.is_active) then
    raise exception 'unknown_profession' using errcode = '22023';
  end if;
  if p_education_type_slug is not null
     and not exists (select 1 from public.education_types e where e.slug = p_education_type_slug and e.is_active) then
    raise exception 'unknown_education_type' using errcode = '22023';
  end if;
  insert into public.education_programs
    (organization_id, name, target_profession_slug, education_type_slug, description, created_by)
  values
    (p_organization_id, btrim(p_name), p_target_profession_slug, p_education_type_slug,
     nullif(btrim(coalesce(p_description, '')), ''), v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_education_cohort_v1(
  p_program_id uuid,
  p_name text,
  p_starts_on date default null,
  p_ends_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_id  uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select organization_id into v_org from public.education_programs where id = p_program_id and archived_at is null;
  if v_org is null then raise exception 'program_not_found' using errcode = '42501'; end if;
  if not public.manages_organization(v_org) then raise exception 'not_manager' using errcode = '42501'; end if;
  insert into public.education_cohorts (program_id, organization_id, name, starts_on, ends_on, created_by)
  values (p_program_id, v_org, btrim(p_name), p_starts_on, p_ends_on, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_education_cohort_member_v1(
  p_cohort_id uuid,
  p_profile_id uuid,
  p_status text default 'active'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_status not in ('active', 'left') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select organization_id into v_org from public.education_cohorts where id = p_cohort_id and archived_at is null;
  if v_org is null then raise exception 'cohort_not_found' using errcode = '42501'; end if;
  if not public.manages_organization(v_org) then raise exception 'not_manager' using errcode = '42501'; end if;
  -- The learner must already be linked to THIS institution as a student
  -- (accepted invitation → engagement context). Membership never creates a
  -- relationship the learner did not accept.
  if not exists (
    select 1 from public.engagement_contexts ec
    where ec.profile_id = p_profile_id and ec.organization_id = v_org
      and ec.relationship_slug = 'student' and ec.status = 'active'
  ) then
    raise exception 'not_a_linked_learner' using errcode = '42501';
  end if;
  insert into public.education_cohort_members (cohort_id, profile_id, status, added_by, left_at)
  values (p_cohort_id, p_profile_id, p_status, v_uid, case when p_status = 'left' then now() end)
  on conflict (cohort_id, profile_id) do update
    set status  = excluded.status,
        left_at = case when excluded.status = 'left' then now() else null end;
end;
$$;

revoke execute on function public.create_education_program_v1(uuid, text, text, text, text) from public, anon;
revoke execute on function public.create_education_cohort_v1(uuid, text, date, date) from public, anon;
revoke execute on function public.set_education_cohort_member_v1(uuid, uuid, text) from public, anon;
grant execute on function public.create_education_program_v1(uuid, text, text, text, text) to authenticated;
grant execute on function public.create_education_cohort_v1(uuid, text, date, date) to authenticated;
grant execute on function public.set_education_cohort_member_v1(uuid, uuid, text) to authenticated;

-- ── 4. Public demand per profession (anon-safe, same boundary as the count) ─

create or replace function public.count_public_vacancies_by_profession_v1(p_limit integer default 20)
returns table (profession_slug text, active_vacancies bigint)
language sql
security definer
set search_path = public
set work_mem = '64MB'
stable
as $$
  select v.profession_slug, count(*)::bigint
    from public.public_vacancies v
   where v.is_active
     and v.profession_slug is not null
     and (v.expires_at is null or v.expires_at > now())
   group by v.profession_slug
   order by count(*) desc, v.profession_slug
   limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke execute on function public.count_public_vacancies_by_profession_v1(p_limit integer) from public;
grant execute on function public.count_public_vacancies_by_profession_v1(p_limit integer) to anon, authenticated;

comment on function public.count_public_vacancies_by_profession_v1(p_limit integer) is
  'Active public vacancies per profession (imported market data), the demand signal for education institutions and agencies. Anon-safe: counts only, same boundary as count_public_vacancies_v1.';

-- ROLLBACK
-- (see supabase/rollbacks/20260903120000_education_programs_cohorts_v1.down.sql — guarded)
-- drop function if exists public.count_public_vacancies_by_profession_v1(integer);
-- drop function if exists public.set_education_cohort_member_v1(uuid, uuid, text);
-- drop function if exists public.create_education_cohort_v1(uuid, text, date, date);
-- drop function if exists public.create_education_program_v1(uuid, text, text, text, text);
-- drop table if exists public.education_cohort_members;
-- drop table if exists public.education_cohorts;
-- drop table if exists public.education_programs;
