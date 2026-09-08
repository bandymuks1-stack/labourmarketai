-- ===========================================================================
-- G-04 — TIMESHEET SUBMIT -> REVIEW -> APPROVE, END TO END, AGAINST THE REAL
-- SCHEMA, WITHOUT CROSSING THE G-01 OWNER GATE.
--
--   membership -> work objects -> split hours -> timesheet -> workflow
--   -> submit -> (refused for non-approvers) -> approve -> decision lands
--   -> approved document is frozen
--
-- WHY THIS IS NOT A REPEAT OF G-01
--   G-01 closed this chain only in its pass 2, by adding the very
--   `engagement_contexts` row that IS the open owner decision. That left G-04
--   looking like it depended on that decision. It does not.
--
--   `belongs_to_organization` recognises TWO relationships:
--       engagement_contexts   (the disputed booking bridge)
--       company_memberships   (an ordinary org member -- not disputed at all)
--
--   This probe uses ONLY the second. The worker here is a plain `member` of
--   the organization, created by the normal membership path, and the probe
--   ASSERTS `engagement_contexts = 0` for that worker at both ends of the run.
--   So whatever the owner decides about G-01, the approval layer is already
--   proven for the actor class it was designed for, and G-04 can be closed
--   independently.
--
-- WHAT THIS IS
--   A reachability probe, not a unit test. Same production RPCs the web client
--   calls, same three actors, same RLS (`set local role authenticated` plus a
--   transaction-local `request.jwt.claims`). No gate is patched.
--
-- WHY IT CANNOT LEAVE RESIDUE
--   One transaction ending in a deliberate `raise exception`. The exception
--   message IS the report. Nothing commits. (G-01 / G-02 / M3 precedent.)
--   Verify with g04-timesheet-approval.residue.sql.
--
-- SEPARATION OF DUTIES IS THE POINT, SO IT IS TESTED AS SUCH
--   The default pack's approver rule is
--   `{"kind":"org_role","roles":["owner","admin"]}`. A `member` is therefore
--   NOT an approver. Three readers who must be refused are probed explicitly:
--     - the requester approving their own timesheet,
--     - an outsider (owner of a DIFFERENT organization) approving it,
--     - an outsider merely VIEWING it.
--   A workflow proof that only ever exercises the permitted approver proves
--   nothing about who is kept out.
--
-- THE SPLIT-HOURS REQUIREMENT TRAVELS WITH IT
--   8 h -> Object 01, 2 h -> Object 05, TOTAL 10 h, as TWO canonical rows,
--   and the timesheet snapshot must carry both. Totals are DERIVED the way the
--   app derives them (`deriveTimesheetTotals` sums `value` over
--   `unit = 'hours'`), never read from keys the snapshot does not contain.
--
-- NAMING
--   Every local is v_-prefixed, for the reason spelled out in G-01: an
--   unprefixed `worker_id` in a WHERE clause resolves to the VARIABLE, turning
--   the predicate into `where true` and producing a probe that passes by
--   accident.
-- ===========================================================================
do $g04$
declare
  v_emp        uuid := '99410000-0000-4000-8000-000000000001';
  v_wrk        uuid := '99410000-0000-4000-8000-000000000002';
  v_out        uuid := '99410000-0000-4000-8000-000000000003';
  v_org        uuid := '99410000-0000-4000-8000-000000000011';
  v_out_org    uuid := '99410000-0000-4000-8000-000000000012';
  v_company    uuid := '99410000-0000-4000-8000-000000000021';
  v_out_co     uuid := '99410000-0000-4000-8000-000000000022';
  v_project    uuid := '99410000-0000-4000-8000-000000000031';

  v_emp_email  text := 'g04-employer@proof.invalid';
  v_wrk_email  text := 'g04-worker@proof.invalid';
  v_out_email  text := 'g04-outsider@proof.invalid';

  v_worker     uuid;
  v_obj01      uuid;
  v_obj05      uuid;
  v_timesheet  uuid;
  v_instance   uuid;
  v_def        uuid;

  v_work_date  date := date '2026-09-01';
  v_start      date := date '2026-09-01';
  v_end        date := date '2026-09-07';

  v_txt        text;
  v_txt2       text;
  v_js         jsonb;
  v_n          int;
  v_n2         int;
  v_hours      numeric;
  v_bool       boolean;
  v_pass       jsonb := jsonb_build_object('probe', 'G-04 timesheet approval',
                                           'relationship', 'company_memberships only');
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- =========================================================================
  -- S0  SEED (connecting role, RLS-bypassing).
  -- One employer who owns the organization, one worker who is a PLAIN MEMBER
  -- of it, one outsider who owns a DIFFERENT organization. One project.
  -- Deliberately NO engagement_contexts row -- that absence is the whole
  -- point of this probe and is asserted, not assumed.
  -- =========================================================================
  insert into auth.users (id, email, is_sso_user, is_anonymous,
                          raw_user_meta_data, raw_app_meta_data, aud, role)
  values (v_emp, v_emp_email, false, false, '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
         (v_wrk, v_wrk_email, false, false, '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
         (v_out, v_out_email, false, false, '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  insert into public.profiles (id, email, full_name, locale, country)
  values (v_emp, v_emp_email, 'G04 Employer', 'lt', 'LT'),
         (v_wrk, v_wrk_email, 'G04 Worker',   'lt', 'LT'),
         (v_out, v_out_email, 'G04 Outsider', 'lt', 'LT')
  on conflict (id) do update set email = excluded.email;

  select w.id into v_worker from public.workers w where w.profile_id = v_wrk limit 1;
  if v_worker is null then
    insert into public.workers (profile_id, display_name) values (v_wrk, 'G04 Worker')
    returning id into v_worker;
  end if;

  insert into public.companies (id, profile_id, legal_name, display_name, country)
  values (v_company, v_emp, 'G04 Proof UAB',   'G04 Proof',   'LT'),
         (v_out_co,  v_out, 'G04 Outside UAB', 'G04 Outside', 'LT')
  on conflict (id) do nothing;

  insert into public.organizations (id, owner_profile_id, organization_type,
                                    legal_name, display_name, country, legacy_company_id)
  values (v_org,     v_emp, 'company', 'G04 Proof UAB',   'G04 Proof',   'LT', v_company),
         (v_out_org, v_out, 'company', 'G04 Outside UAB', 'G04 Outside', 'LT', v_out_co)
  on conflict (id) do nothing;

  -- THE RELATIONSHIP UNDER TEST. `member` is the lowest membership role in the
  -- closed vocabulary (owner|admin|manager|external_manager|member), so the
  -- worker is deliberately NOT an approver under the default pack's rule.
  insert into public.company_memberships (organization_id, profile_id, role, status, accepted_at)
  values (v_org,     v_emp, 'owner',  'active', now()),
         (v_org,     v_wrk, 'member', 'active', now()),
         (v_out_org, v_out, 'owner',  'active', now())
  on conflict do nothing;

  insert into public.projects (id, organization_id, company_id, title, country, status)
  values (v_project, v_org, v_company, 'G04 Proof project', 'LT', 'draft')
  on conflict (id) do nothing;

  -- The assertion is scoped TO THIS ORGANIZATION on purpose.
  --
  -- `ensure_worker_personal_engagement` (AFTER INSERT ON workers) gives every
  -- worker exactly one `engagement_contexts` row: slug `employee`,
  -- `organization_id` NULL -- a PERSONAL context attached to no organization.
  -- `belongs_to_organization(org)` matches on `ec.organization_id = org`, and
  -- NULL never equals an org, so that row cannot satisfy the gate.
  --
  -- An unscoped `count(*) = 0` would therefore fail against a row that is
  -- irrelevant to what is being proven. Both counts are reported so the claim
  -- can be checked rather than taken on trust.
  select count(*) into v_n from public.engagement_contexts ec
   where ec.profile_id = v_wrk and ec.organization_id = v_org;
  select count(*) into v_n2 from public.engagement_contexts ec
   where ec.profile_id = v_wrk and ec.organization_id is null;
  v_pass := v_pass || jsonb_build_object('S0_seed', jsonb_build_object(
        'ok', v_n = 0, 'worker_id', v_worker,
        'engagement_contexts_for_THIS_org_must_be_0', v_n,
        'personal_org_null_contexts_auto_created', v_n2));

  -- =========================================================================
  -- S0b  GATE DIAGNOSTICS. The worker must reach the organization through
  -- MEMBERSHIP alone. If `belongs_to_organization` were true here for any
  -- other reason, the rest of this probe would be measuring the wrong thing.
  -- =========================================================================
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_wrk, 'role', 'authenticated')::text, true);
  v_pass := v_pass || jsonb_build_object('S0b_gates_worker', jsonb_build_object(
        'owns_worker',              public.owns_worker(v_worker),
        'belongs_to_organization',  public.belongs_to_organization(v_org),
        'manages_organization',     public.manages_organization(v_org),
        'is_org_member_or_engaged', public.is_org_member_or_engaged_v1(v_org)));

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
  v_pass := v_pass || jsonb_build_object('S0b_gates_outsider', jsonb_build_object(
        'belongs_to_organization_must_be_false', public.belongs_to_organization(v_org),
        'manages_organization_must_be_false',    public.manages_organization(v_org)));
  execute 'reset role';

  -- ================= S1  APPROVAL TEMPLATE ================================
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
    v_js := public.install_default_workflow_pack_v1(v_org::text);
    execute 'reset role';
    select d.id into v_def
      from public.workflow_definitions d
      join public.workflow_definition_versions v on v.definition_id = d.id
     where d.organization_id = v_org and d.context_entity_type = 'timesheet'
       and d.is_active and v.published_at is not null
     limit 1;
    v_pass := v_pass || jsonb_build_object('S1_approval_template',
          jsonb_build_object('ok', v_def is not null, 'outcome', v_js->>'outcome'));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S1_approval_template',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S1b  THE WEB PATH'S READ =============================
  -- The app finds the template through PostgREST under RLS, not through the
  -- RPC. If the worker cannot SELECT it, the button says "no template"
  -- however healthy the RPC layer is.
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_wrk, 'role', 'authenticated')::text, true);
    select count(*) into v_n from public.workflow_definitions d
     where d.organization_id = v_org and d.context_entity_type = 'timesheet' and d.is_active;
    select count(*) into v_n2 from public.workflow_definition_versions v
     where v.definition_id = v_def and v.published_at is not null;
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S1b_worker_reads_template',
          jsonb_build_object('ok', v_n > 0 and v_n2 > 0,
                             'definitions_visible', v_n, 'published_versions_visible', v_n2));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S1b_worker_reads_template',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S2  WORK OBJECTS =====================================
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
    v_txt  := public.create_work_object_v1(v_org::text, 'G04 Object 01', v_project::text,
                                           'LT', null, 'Vilnius', null, null, null);
    v_txt2 := public.create_work_object_v1(v_org::text, 'G04 Object 05', v_project::text,
                                           'LT', null, 'Vilnius', null, null, null);
    execute 'reset role';
    select o.id into v_obj01 from public.work_objects o
     where o.organization_id = v_org and o.name = 'G04 Object 01' limit 1;
    select o.id into v_obj05 from public.work_objects o
     where o.organization_id = v_org and o.name = 'G04 Object 05' limit 1;
    v_pass := v_pass || jsonb_build_object('S2_work_objects',
          jsonb_build_object('ok', v_obj01 is not null and v_obj05 is not null,
                             'outcome_01', v_txt, 'outcome_05', v_txt2));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S2_work_objects',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S3  SPLIT HOURS ======================================
  -- The owner's case. 8 h -> Object 01, 2 h -> Object 05. TWO canonical rows.
  -- Not one row of 10 h, not an average, not a rewrite of a previous row.
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
    insert into public.work_hour_allocations
      (organization_id, worker_id, entered_by, work_date, work_object_id,
       hours_numeric, note, source)
    values (v_org, v_worker, v_emp, v_work_date, v_obj01, 8, 'G-04 proof 8h', 'manual'),
           (v_org, v_worker, v_emp, v_work_date, v_obj05, 2, 'G-04 proof 2h', 'manual');
    execute 'reset role';
    select count(*), coalesce(sum(a.hours_numeric), 0) into v_n, v_hours
      from public.work_hour_allocations a
     where a.worker_id = v_worker and a.organization_id = v_org;
    v_pass := v_pass || jsonb_build_object('S3_split_hours',
          jsonb_build_object('ok', v_n = 2 and v_hours = 10,
                             'allocation_rows', v_n, 'total_hours', v_hours::text));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S3_split_hours',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S4  TIMESHEET ========================================
  -- Created by the WORKER, on the membership relationship alone.
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_wrk, 'role', 'authenticated')::text, true);
    v_txt := public.create_timesheet_v1(v_org::text, v_start::text, v_end::text);
    execute 'reset role';
    if v_txt ~ '^[0-9a-f-]{36}$' then
      v_timesheet := v_txt::uuid;
      select t.lines_snapshot into v_js from public.timesheets t where t.id = v_timesheet;
      select count(*), coalesce(sum((l->>'value')::numeric) filter (where l->>'unit' = 'hours'), 0)
        into v_n, v_hours
        from jsonb_array_elements(coalesce(v_js->'lines', '[]'::jsonb)) l;
      v_pass := v_pass || jsonb_build_object('S4_timesheet',
            jsonb_build_object('ok', v_n = 2 and v_hours = 10,
                               'derived_line_count', v_n,
                               'derived_total_hours', v_hours::text,
                               'source', v_js->'source'));
    else
      v_pass := v_pass || jsonb_build_object('S4_timesheet',
            jsonb_build_object('ok', false, 'outcome', v_txt));
    end if;
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S4_timesheet',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S5  SUBMIT ===========================================
  -- Engine first, then freeze -- the app's own order.
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_wrk, 'role', 'authenticated')::text, true);
    v_txt := public.start_workflow_instance_v1(v_def::text,
               'Timesheet ' || v_start::text || ' - ' || v_end::text,
               jsonb_build_object('periodStart', v_start::text, 'periodEnd', v_end::text),
               v_timesheet::text);
    if v_txt ~ '^[0-9a-f-]{36}$' then v_instance := v_txt::uuid; end if;
    v_txt2 := public.submit_timesheet_v1(v_timesheet::text);
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S5_submit',
          jsonb_build_object('ok', v_txt2 = 'submitted' and v_instance is not null,
                             'start_outcome', v_txt, 'submit_outcome', v_txt2));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S5_submit',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S6  SEPARATION OF DUTIES (must all be refused) =======
  -- Refusal is the PASS condition. Each is asserted as "not approved", and
  -- the instance is re-read afterwards to confirm it is still pending -- a
  -- refusal string returned while the instance quietly advanced would be
  -- worse than no check at all.
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_wrk, 'role', 'authenticated')::text, true);
    v_txt := public.decide_workflow_step_v1(v_instance::text, 'approved', 'requester self-approval');

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
    v_txt2 := public.decide_workflow_step_v1(v_instance::text, 'approved', 'outsider approval');
    select public.timesheet_can_view_v1(v_timesheet) into v_bool;
    execute 'reset role';

    select count(*) into v_n from public.workflow_instances i
     where i.id = v_instance and i.status = 'pending';
    v_pass := v_pass || jsonb_build_object('S6_separation_of_duties',
          jsonb_build_object(
            'ok', v_txt <> 'approved' and v_txt2 <> 'approved'
                  and v_bool is not true and v_n = 1,
            'requester_self_approve_refused_with', v_txt,
            'outsider_approve_refused_with', v_txt2,
            'outsider_can_view_must_be_false', v_bool,
            'instance_still_pending', v_n));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S6_separation_of_duties',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S7  REVIEW + APPROVE =================================
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
    v_txt := public.decide_workflow_step_v1(v_instance::text, 'approved', 'G-04 proof approval');
    execute 'reset role';
    select count(*) into v_n from public.workflow_instances i
     where i.id = v_instance and i.status = 'approved';
    v_pass := v_pass || jsonb_build_object('S7_review_approve',
          jsonb_build_object('ok', v_txt = 'approved' and v_n = 1,
                             'decision_outcome', v_txt, 'instance_approved_rows', v_n));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S7_review_approve',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S8  DECISION LANDS ON THE DOCUMENT ===================
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
    v_txt := public.sync_timesheet_decision_v1(v_timesheet::text);
    execute 'reset role';
    select t.status into v_txt2 from public.timesheets t where t.id = v_timesheet;
    select count(*) into v_n from public.timesheet_events e
     where e.timesheet_id = v_timesheet and e.action = 'approved';
    v_pass := v_pass || jsonb_build_object('S8_decision_lands',
          jsonb_build_object('ok', v_txt = 'approved' and v_txt2 = 'approved' and v_n = 1,
                             'sync_outcome', v_txt, 'timesheet_status', v_txt2,
                             'approved_events', v_n));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S8_decision_lands',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S9  APPROVED DOCUMENT IS FROZEN ======================
  -- Refusal is again the PASS condition, and the stored status is re-read to
  -- make sure the refusal was real rather than cosmetic.
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_wrk, 'role', 'authenticated')::text, true);
    v_txt := public.submit_timesheet_v1(v_timesheet::text);
    execute 'reset role';
    select t.status into v_txt2 from public.timesheets t where t.id = v_timesheet;
    v_pass := v_pass || jsonb_build_object('S9_approved_is_frozen',
          jsonb_build_object('ok', v_txt <> 'submitted' and v_txt2 = 'approved',
                             'resubmit_refused_with', v_txt,
                             'status_still', v_txt2));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S9_approved_is_frozen',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S10  THE G-01 GATE WAS NEVER CROSSED =================
  -- Closing assertion. If a row appeared in `engagement_contexts` for this
  -- worker at any point, this whole probe would have proven G-01's pass 2
  -- again instead of proving G-04 independently.
  select count(*) into v_n from public.engagement_contexts ec
   where ec.profile_id = v_wrk and ec.organization_id = v_org;
  -- Prove the membership arm is what carries the gate, by removing the other
  -- arm's possibility entirely: with zero org-scoped contexts, a true
  -- `belongs_to_organization` can only have come from `company_memberships`.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_wrk, 'role', 'authenticated')::text, true);
  select public.belongs_to_organization(v_org) into v_bool;
  execute 'reset role';
  select count(*) into v_n2 from public.company_memberships m
   where m.profile_id = v_wrk and m.organization_id = v_org and m.status = 'active';
  v_pass := v_pass || jsonb_build_object('S10_g01_gate_not_crossed',
        jsonb_build_object('ok', v_n = 0 and v_bool and v_n2 = 1,
                           'engagement_contexts_for_THIS_org_must_be_0', v_n,
                           'active_memberships_for_THIS_org', v_n2,
                           'belongs_to_organization_via_membership', v_bool));

  raise exception 'G04_REPORT %', jsonb_pretty(v_pass) using errcode = 'P0001';
end;
$g04$;
