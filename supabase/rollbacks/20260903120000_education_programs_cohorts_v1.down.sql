-- Rollback for 20260903120000_education_programs_cohorts_v1
-- GUARDED: refuses while any programme, cohort or membership row exists, so no
-- institution's structure is silently lost. Archive or export first.

do $$
begin
  if exists (select 1 from public.education_cohort_members)
     or exists (select 1 from public.education_cohorts)
     or exists (select 1 from public.education_programs) then
    raise exception 'rollback refused: education programme/cohort/member rows exist. Export or clear them first.'
      using errcode = 'P0004';
  end if;
end;
$$;

drop function if exists public.count_public_vacancies_by_profession_v1(integer);
drop index if exists public.public_vacancies_active_profession_cover_idx;
drop function if exists public.set_education_cohort_member_v1(uuid, uuid, text);
drop function if exists public.create_education_cohort_v1(uuid, text, date, date);
drop function if exists public.create_education_program_v1(uuid, text, text, text, text);

drop table if exists public.education_cohort_members;
drop table if exists public.education_cohorts;
drop table if exists public.education_programs;
