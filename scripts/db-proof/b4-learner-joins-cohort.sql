-- ============================================================================
-- B4 — J-INSTITUTION-OUTCOME "Learners join the cohort" — PRODUCTION WALK,
-- ROLLED BACK. Run whole via Supabase MCP execute_sql; the P0001 error IS the
-- report and nothing commits. Zero residue by construction.
--
-- Executed 2026-09-15 against production with the real institution manager
-- (owner of the one training_provider organisation that has a cohort), the
-- one accepted `student` engagement, and an unrelated profile as the outsider.
-- Result: {"s1_outsider_assign":"42501 not_manager",
--          "s2_mgr_assign_unlinked":"42501 not_a_linked_learner",
--          "s3_mgr_assign_linked":"ok","s3_mgr_rls_readback":1,
--          "s4_student_rls_read":1,"s5_outsider_rls_read":0,
--          "s6_mgr_left":"left/true","baseline_members":0}
-- Residue check afterwards: education_cohort_members 0, cohorts 1, programs 1.
--
-- Replace the four ids before re-running; never hard-code production ids in
-- a committed file. Every stage runs in its own sub-block so a refusal is a
-- reported result, not an abort.
-- ============================================================================
do $$
declare
  v_mgr uuid := :'manager_profile_id';
  v_cohort uuid := :'cohort_id';
  v_student uuid := :'student_profile_id';
  v_outsider uuid := :'outsider_profile_id';
  v_mgr_email text; v_student_email text; v_out_email text;
  r jsonb := '{}'::jsonb;
  n int; s text;
begin
  select email into v_mgr_email from profiles where id=v_mgr;
  select email into v_student_email from profiles where id=v_student;
  select email into v_out_email from profiles where id=v_outsider;
  r := r || jsonb_build_object('baseline_members', (select count(*) from education_cohort_members));

  -- stage 1: OUTSIDER (not a manager) tries to assign -> must be refused
  begin
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claims', json_build_object('sub',v_outsider,'role','authenticated','email',v_out_email)::text, true);
    perform public.set_education_cohort_member_v1(v_cohort, v_student, 'active');
    r := r || jsonb_build_object('s1_outsider_assign','UNEXPECTED_SUCCESS');
  exception when others then
    r := r || jsonb_build_object('s1_outsider_assign', sqlstate||' '||sqlerrm);
  end;
  perform set_config('role','postgres',true);

  -- stage 2: MANAGER assigns a person NOT linked as a student -> must be refused
  begin
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claims', json_build_object('sub',v_mgr,'role','authenticated','email',v_mgr_email)::text, true);
    perform public.set_education_cohort_member_v1(v_cohort, v_outsider, 'active');
    r := r || jsonb_build_object('s2_mgr_assign_unlinked','UNEXPECTED_SUCCESS');
  exception when others then
    r := r || jsonb_build_object('s2_mgr_assign_unlinked', sqlstate||' '||sqlerrm);
  end;
  perform set_config('role','postgres',true);

  -- stage 3: MANAGER assigns the linked student -> must succeed; read back under RLS
  begin
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claims', json_build_object('sub',v_mgr,'role','authenticated','email',v_mgr_email)::text, true);
    perform public.set_education_cohort_member_v1(v_cohort, v_student, 'active');
    select count(*) into n from education_cohort_members where cohort_id=v_cohort and profile_id=v_student and status='active';
    r := r || jsonb_build_object('s3_mgr_assign_linked','ok','s3_mgr_rls_readback',n);
  exception when others then
    r := r || jsonb_build_object('s3_mgr_assign_linked', sqlstate||' '||sqlerrm);
  end;
  perform set_config('role','postgres',true);

  -- stage 4: STUDENT reads own membership under RLS -> 1
  begin
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claims', json_build_object('sub',v_student,'role','authenticated','email',v_student_email)::text, true);
    select count(*) into n from education_cohort_members where cohort_id=v_cohort;
    r := r || jsonb_build_object('s4_student_rls_read', n);
  exception when others then
    r := r || jsonb_build_object('s4_student_rls_read', sqlstate||' '||sqlerrm);
  end;
  perform set_config('role','postgres',true);

  -- stage 5: OUTSIDER reads under RLS -> must be 0
  begin
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claims', json_build_object('sub',v_outsider,'role','authenticated','email',v_out_email)::text, true);
    select count(*) into n from education_cohort_members where cohort_id=v_cohort;
    r := r || jsonb_build_object('s5_outsider_rls_read', n);
  exception when others then
    r := r || jsonb_build_object('s5_outsider_rls_read', sqlstate||' '||sqlerrm);
  end;
  perform set_config('role','postgres',true);

  -- stage 6: MANAGER marks 'left' -> left_at set
  begin
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claims', json_build_object('sub',v_mgr,'role','authenticated','email',v_mgr_email)::text, true);
    perform public.set_education_cohort_member_v1(v_cohort, v_student, 'left');
    select status||'/'||(left_at is not null)::text into s from education_cohort_members where cohort_id=v_cohort and profile_id=v_student;
    r := r || jsonb_build_object('s6_mgr_left', s);
  exception when others then
    r := r || jsonb_build_object('s6_mgr_left', sqlstate||' '||sqlerrm);
  end;
  perform set_config('role','postgres',true);

  raise exception 'REPORT %', r::text;
end $$;

-- Residue check (run separately, must match the pre-walk counts):
-- select (select count(*) from education_cohort_members) members,
--        (select count(*) from education_cohorts) cohorts,
--        (select count(*) from education_programs) programs;
