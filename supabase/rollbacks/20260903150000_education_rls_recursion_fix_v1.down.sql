-- 20260903150000_education_rls_recursion_fix_v1.down.sql
-- Reverses the recursion fix: restores the three ORIGINAL SELECT policies of
-- 20260903120000 verbatim (this re-introduces the 42P17 recursion — that was
-- the previous state; run only to return to it deliberately) and drops the
-- three helper functions. No table data is touched.

drop policy if exists education_programs_select on public.education_programs;
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

drop policy if exists education_cohorts_select on public.education_cohorts;
create policy education_cohorts_select on public.education_cohorts for select
  using (
    public.manages_organization(organization_id)
    or exists (
      select 1 from public.education_cohort_members m
      where m.cohort_id = education_cohorts.id and m.profile_id = auth.uid() and m.status = 'active'
    )
    or public.is_admin()
  );

drop policy if exists education_cohort_members_select on public.education_cohort_members;
create policy education_cohort_members_select on public.education_cohort_members for select
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.education_cohorts c
      where c.id = education_cohort_members.cohort_id and public.manages_organization(c.organization_id)
    )
    or public.is_admin()
  );

drop function if exists public.is_active_program_member_v1(uuid);
drop function if exists public.is_active_cohort_member_v1(uuid);
drop function if exists public.education_cohort_organization_v1(uuid);
