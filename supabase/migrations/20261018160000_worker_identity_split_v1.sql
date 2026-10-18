-- 20261018160000_worker_identity_split_v1
-- @human-gate-approved
--
-- RED (needs-human-gate): RLS policy replacement on public.workers, SECURITY DEFINER functions, GRANT.
-- Apply ONLY via Supabase MCP `apply_migration` after the owner's explicit approval, in the SAME step as
-- the production deploy of the app change (the scouting / person-page reads move to the projection).
-- Never `db push`.
--
-- OWNER COMMAND 2026-10-18 ("Privatumo apsaugos prioritetas"): a worker found through the employer-
-- visibility consent is anonymous. Employers see only professional data; name, contacts, photo and links
-- reach one organization only with the worker's own permission; no plan (paid or VIP) opens identity.
--
-- THE DEFECT. `workers_select` is `can_view_worker(id)`, whose discoverability branch
-- (`is_employer() AND worker_profile_discoverable(profile_id)`) returns the WHOLE `workers` row to every
-- employer account — display name, free-text availability note, location, accommodation / transport /
-- shift preferences — although the consent preview the worker saw lists only professional fields.
-- The app renders those workers anonymously, but the API row is readable with any employer session.
--
-- THE FIX (narrowing only — no access is added anywhere):
--   1. caller_has_worker_relation_v1 — can_view_worker WITHOUT the discoverability branch. Byte-identical
--      body to the one in 20261018150000 (the profile-view limit), and the same audience rule as the
--      applied worker_recognitions_for_viewer_v1 (owner decision 2026-10-08).
--   2. workers_select uses it: the raw row (with identity) only for the worker, an admin, or a viewer
--      with a working relationship.
--   3. list_discoverable_worker_profiles_v1 — the ONLY discovery read of the row: preview-consented
--      professional columns for discoverable workers, never a name or free text, plus a synthetic-
--      fixture flag computed in SQL so the app can keep QA fixtures out without seeing a name.
--   can_view_worker itself is UNCHANGED: worker_skills / worker_professions / worker_languages and the
--   definer functions that use it (contact ask, booking, profile-view gate) keep working as today.
--
-- Rollback: supabase/rollbacks/20261018160000_worker_identity_split_v1.down.sql

begin;

-- 1. The working-relationship predicate (identical to 20261018150000_employer_profile_views_v1).
create or replace function public.caller_has_worker_relation_v1(p_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.owns_worker(p_worker_id)
    or public.is_admin()
    or exists (
      select 1 from public.company_workers cw join public.companies c on c.id = cw.company_id
       where cw.worker_id = p_worker_id and cw.status = 'active' and c.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.agency_workers aw join public.agencies a on a.id = aw.agency_id
       where aw.worker_id = p_worker_id and aw.status = 'active' and a.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.company_worker_engagements e
       where e.worker_id is not null and e.worker_id = p_worker_id and e.status = 'active'
         and public.owns_company(e.company_id)
    )
    or exists (
      select 1 from public.engagement_contexts ec
        join public.relationship_types rt on rt.slug = ec.relationship_slug and rt.grants_worker_visibility
        join public.workers x on x.id = p_worker_id and x.profile_id = ec.profile_id
       where ec.status = 'active' and public.manages_organization(ec.organization_id)
    )
    or exists (
      select 1 from public.project_worker_assignments pwa
       where pwa.worker_id = p_worker_id and pwa.status = 'active' and pwa.ended_at is null
         and public.can_manage_project(pwa.project_id)
    );
$$;
revoke all on function public.caller_has_worker_relation_v1(uuid) from public;
revoke all on function public.caller_has_worker_relation_v1(uuid) from anon;
grant execute on function public.caller_has_worker_relation_v1(uuid) to authenticated;

-- 2. The raw row only with a working relationship (or self / admin). Narrowing, not loosening.
drop policy if exists workers_select on public.workers;
create policy workers_select on public.workers
  for select using (public.caller_has_worker_relation_v1(id));

-- 3. The discovery projection: professional fields only, for discoverable workers, to employers.
create or replace function public.list_discoverable_worker_profiles_v1(p_worker_ids uuid[])
returns table (
  id uuid,
  experience_years integer,
  preferred_countries text[],
  availability_status text,
  available_from date,
  salary_min_eur integer,
  salary_max_eur integer,
  created_at timestamptz,
  updated_at timestamptz,
  is_synthetic_fixture boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_worker_ids is null or cardinality(p_worker_ids) = 0 then
    return;
  end if;
  if cardinality(p_worker_ids) > 500 then
    raise exception 'Too many workers requested' using errcode = '22023';
  end if;
  -- Same audience as the discoverability branch it replaces: an employer (or an admin).
  if not (public.is_employer() or public.is_admin()) then
    return;
  end if;
  return query
    select w.id, w.experience_years, w.preferred_countries, w.availability_status, w.available_from,
           w.salary_min_eur, w.salary_max_eur, w.created_at, w.updated_at,
           -- QA fixtures are recognised by their documented markers (lib/qa/synthetic-fixture.ts);
           -- the flag leaves the database, the name never does.
           coalesce(w.display_name, '') ~* '(\mQA[-_ ]SYNTHETIC\M|\[E2E\]|\mE2E[-_ ]FIXTURE\M)'
      from public.workers w
     where w.id = any (p_worker_ids)
       and w.profile_id is not null
       and public.worker_profile_discoverable(w.profile_id);
end;
$$;
revoke all on function public.list_discoverable_worker_profiles_v1(uuid[]) from public;
revoke all on function public.list_discoverable_worker_profiles_v1(uuid[]) from anon;
grant execute on function public.list_discoverable_worker_profiles_v1(uuid[]) to authenticated;

commit;
