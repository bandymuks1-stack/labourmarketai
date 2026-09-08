-- @human-gate-approved — owner approval "Apply batch 2026-09-03 D" (2026-09-03); APPLIED TO PROD via Supabase MCP after the rolled-back prod proof recorded in PR #1457
-- 20260903150000_education_rls_recursion_fix_v1
--
-- ██ RED CLASS — human gate (migration-safety: DROP/CREATE POLICY + SECURITY
-- ██ DEFINER + GRANT/REVOKE). Draft; owner-channel apply only.
--
-- PRODUCTION DEFECT (found 2026-09-03 by the Lane B pilot walk, prod-verified):
-- the three SELECT policies of RED batch B (20260903120000) reference each
-- other — programmes → cohorts+members, cohorts → members, members → cohorts —
-- and Postgres refuses EVERY read of the three tables by any non-owner role:
--
--   42P17 infinite recursion detected in policy for relation "education_cohorts"
--
-- Manager, learner, outsider alike. The institution programmes section
-- therefore degrades to "—" and cannot even offer the create form; the
-- SECURITY DEFINER commands (owner-run) still write fine, so rows can exist
-- that nobody can read. No data is wrong; the read path is closed.
--
-- FIX (semantics byte-for-byte the same, only the evaluation path changes):
-- the "is the caller an active member" and "which organisation owns this
-- cohort" questions move into three tiny SECURITY DEFINER helpers (owner
-- postgres = table owner, so RLS is not re-entered), and the three policies
-- call the helpers instead of querying each other. Who may read what is
-- UNCHANGED:
--   programmes  : managers of the organisation | active member of one of its cohorts | admin
--   cohorts     : managers of the organisation | active member of that cohort | admin
--   memberships : the learner themself | managers of the cohort's organisation | admin
-- Writes stay exclusively behind the three existing definer commands
-- (authenticated holds no INSERT/UPDATE/DELETE on the tables — unchanged).
--
-- Helpers: EXECUTE revoked from public/anon, granted to authenticated only;
-- they leak nothing (a boolean about the CALLER's own membership; an org id
-- that is only useful inside manages_organization()).
--
-- Prod proof (rolled back, 2026-09-03): after this DDL, the manager reads
-- 1 programme / 1 cohort / 1 membership it created; the learner reads exactly
-- its own membership joined to cohort + programme; an unlinked worker reads
-- 0 / 0 / 0; the learner's direct INSERT → 42501; the learner calling the
-- manager command → not_manager; anon → 42501 on helpers and tables.
--
-- Reversible: supabase/rollbacks/20260903150000_education_rls_recursion_fix_v1.down.sql
-- restores the original three policies verbatim (which re-introduces the
-- recursion — that is the previous state) and drops the helpers.

create or replace function public.is_active_cohort_member_v1(p_cohort_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.education_cohort_members m
     where m.cohort_id = p_cohort_id
       and m.profile_id = auth.uid()
       and m.status = 'active'
  );
$$;
comment on function public.is_active_cohort_member_v1(uuid) is
  'RLS helper: is the CALLER an active member of this cohort. SECURITY DEFINER so the cohort/member policies do not re-enter each other (42P17).';

create or replace function public.is_active_program_member_v1(p_program_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.education_cohorts c
      join public.education_cohort_members m on m.cohort_id = c.id
     where c.program_id = p_program_id
       and m.profile_id = auth.uid()
       and m.status = 'active'
  );
$$;
comment on function public.is_active_program_member_v1(uuid) is
  'RLS helper: is the CALLER an active member of any cohort of this programme. SECURITY DEFINER to avoid policy recursion.';

create or replace function public.education_cohort_organization_v1(p_cohort_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select c.organization_id from public.education_cohorts c where c.id = p_cohort_id;
$$;
comment on function public.education_cohort_organization_v1(uuid) is
  'RLS helper: the organisation that owns a cohort (for manages_organization in the membership policy). SECURITY DEFINER to avoid policy recursion.';

revoke execute on function public.is_active_cohort_member_v1(uuid) from public, anon;
revoke execute on function public.is_active_program_member_v1(uuid) from public, anon;
revoke execute on function public.education_cohort_organization_v1(uuid) from public, anon;
grant execute on function public.is_active_cohort_member_v1(uuid) to authenticated;
grant execute on function public.is_active_program_member_v1(uuid) to authenticated;
grant execute on function public.education_cohort_organization_v1(uuid) to authenticated;

-- Same readers as before; no policy queries another policy-guarded table.
drop policy if exists education_programs_select on public.education_programs;
create policy education_programs_select on public.education_programs for select
  using (
    public.manages_organization(organization_id)
    or public.is_active_program_member_v1(id)
    or public.is_admin()
  );

drop policy if exists education_cohorts_select on public.education_cohorts;
create policy education_cohorts_select on public.education_cohorts for select
  using (
    public.manages_organization(organization_id)
    or public.is_active_cohort_member_v1(id)
    or public.is_admin()
  );

drop policy if exists education_cohort_members_select on public.education_cohort_members;
create policy education_cohort_members_select on public.education_cohort_members for select
  using (
    profile_id = auth.uid()
    or public.manages_organization(public.education_cohort_organization_v1(cohort_id))
    or public.is_admin()
  );

-- ROLLBACK: see supabase/rollbacks/20260903150000_education_rls_recursion_fix_v1.down.sql
-- (restores the three original policies and drops the three helpers).
