-- ===========================================================================
-- G-01 — ONE OPERATIONAL LOOP, END TO END, AGAINST THE REAL SCHEMA.
--
--   interest -> booking -> engagement -> assignment -> work object -> hours
--   -> split allocation -> timesheet -> submit -> review -> approve
--
-- Owner's split-hours requirement:  8 h -> Object 01, 2 h -> Object 05,
-- TOTAL 10 h, as TWO canonical allocation lines carrying provenance.
--
-- WHAT THIS IS
--   A reachability probe, not a unit test. It calls the SAME production RPCs
--   the web / chat / MCP clients call, as the SAME two actors, under the SAME
--   RLS -- `set local role authenticated` plus a transaction-local
--   `request.jwt.claims`. Nothing here re-implements a single gate, and no
--   gate is patched: the probe measures the product as deployed.
--
-- WHY IT CANNOT LEAVE RESIDUE
--   Every write happens inside ONE transaction that ENDS IN A DELIBERATE
--   `raise exception`. The exception message IS the report. Postgres rolls the
--   whole transaction back, so this can be run against production without
--   adding a row to it. (M3 precedent, 2026-08-31.) Verify afterwards with
--   scripts/db-proof/g01-operational-loop.residue.sql.
--
-- IT WALKS THE LOOP TWICE
--   PASS 1 (`relationship_granted = false`) -- the world as it ships today:
--     the worker reaches the organization ONLY through the booking loop.
--   PASS 2 (`relationship_granted = true`) -- the same walk plus ONE row: the
--     canonical person<->organization relationship of DOCTRINE 5.5,
--     `engagement_contexts`, using an EXISTING registry slug (`freelancer`).
--   The two passes use disjoint synthetic identities (9901* and 9902*) so
--   neither can contaminate the other. The DELTA between them is the finding.
--
-- STAGES ARE INDIVIDUALLY FAULT-ISOLATED
--   Each stage runs in its own BEGIN/EXCEPTION sub-block and records its own
--   SQLSTATE. A stage that fails does NOT abort the probe -- the report shows
--   exactly how far the loop reaches and what refused it. That distinction
--   (refused vs missing vs broken) is the entire point.
--
-- NAMING
--   Every local is v_-prefixed. Unprefixed names like `project_id` would be
--   resolved by plpgsql as the VARIABLE inside a WHERE clause that meant to
--   name the COLUMN, silently turning `where project_id = project_id` into
--   `where true` -- a probe that passes by accident.
--
-- TOTALS ARE DERIVED, NOT READ
--   `lines_snapshot` stores `lines` + `source` only. `totalHours` / `lineCount`
--   are derived in the app (`deriveTimesheetTotals`, lib/timesheets/
--   timesheets-model.ts). This probe therefore derives them the same way --
--   summing `value` over `unit = 'hours'` -- instead of reading keys the
--   snapshot does not contain and calling a null a pass.
-- ===========================================================================
do $g01$
declare
  v_mode       boolean;
  v_prefix     text;
  v_emp        uuid;
  v_wrk        uuid;
  v_org        uuid;
  v_company    uuid;
  v_request    uuid;
  v_project    uuid;
  v_emp_email  text;
  v_wrk_email  text;

  v_worker     uuid;
  v_empworker  uuid;
  v_booking    uuid;
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
  v_hours      numeric;
  v_pass       jsonb;
  v_report     jsonb := '[]'::jsonb;
begin
foreach v_mode in array array[false, true] loop
  v_pass    := '[]'::jsonb;
  v_prefix  := case when v_mode then '9902' else '9901' end;
  v_emp     := (v_prefix || '0001-0000-4000-8000-000000000001')::uuid;
  v_wrk     := (v_prefix || '0002-0000-4000-8000-000000000002')::uuid;
  v_org     := (v_prefix || '0003-0000-4000-8000-000000000003')::uuid;
  v_company := (v_prefix || '0004-0000-4000-8000-000000000004')::uuid;
  v_request := (v_prefix || '0005-0000-4000-8000-000000000005')::uuid;
  v_project := (v_prefix || '0006-0000-4000-8000-000000000006')::uuid;
  v_emp_email := 'g01-employer-' || v_prefix || '@proof.invalid';
  v_wrk_email := 'g01-worker-'   || v_prefix || '@proof.invalid';
  v_worker := null; v_booking := null; v_obj01 := null; v_obj05 := null;
  v_timesheet := null; v_instance := null; v_def := null;

  -- Seeding is an OUT-OF-BAND operation, not a user action -- clear whatever
  -- identity the previous pass left in the transaction. `profiles.email` is
  -- bound to the authenticated identity (enforce_profile_email_binding), so
  -- seeding pass 2 under pass 1's leftover JWT is correctly refused with
  -- 42501. That refusal is the guard working; leaving the JWT set would make
  -- this probe fail for a reason that has nothing to do with the loop.
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- =========================================================================
  -- SEED (as the connecting role, RLS-bypassing). One employer who owns one
  -- company + one organization, one worker, one submitted demand, one project.
  -- Nothing else. In particular NO company_workers roster row -- so the
  -- assignment stage must pass on the BOOKING arm alone, which is exactly
  -- what G-01 claims.
  -- =========================================================================
  insert into auth.users (id, email, is_sso_user, is_anonymous,
                          raw_user_meta_data, raw_app_meta_data, aud, role)
  values (v_emp, v_emp_email, false, false, '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
         (v_wrk, v_wrk_email, false, false, '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  insert into public.profiles (id, email, full_name, locale, country)
  values (v_emp, v_emp_email, 'G01 Employer', 'lt', 'LT'),
         (v_wrk, v_wrk_email, 'G01 Worker',   'lt', 'LT')
  on conflict (id) do update set email = excluded.email;

  -- The profile trigger may already have minted workers; adopt or create.
  select w.id into v_worker from public.workers w where w.profile_id = v_wrk limit 1;
  if v_worker is null then
    insert into public.workers (profile_id, display_name) values (v_wrk, 'G01 Worker')
    returning id into v_worker;
  end if;
  select w.id into v_empworker from public.workers w where w.profile_id = v_emp limit 1;

  insert into public.companies (id, profile_id, legal_name, display_name, country)
  values (v_company, v_emp, 'G01 Proof UAB', 'G01 Proof', 'LT')
  on conflict (id) do nothing;

  insert into public.organizations (id, owner_profile_id, organization_type,
                                    legal_name, display_name, country, legacy_company_id)
  values (v_org, v_emp, 'company', 'G01 Proof UAB', 'G01 Proof', 'LT', v_company)
  on conflict (id) do nothing;

  insert into public.company_memberships (organization_id, profile_id, role, status, accepted_at)
  values (v_org, v_emp, 'owner', 'active', now())
  on conflict do nothing;

  insert into public.customer_requests (id, profile_id, organization_id, title,
                                        need_summary, country, status)
  values (v_request, v_emp, v_org, 'G01 electrician need',
          'Two objects, one week', 'LT', 'submitted')
  on conflict (id) do nothing;

  insert into public.projects (id, organization_id, company_id, title, country, status)
  values (v_project, v_org, v_company, 'G01 Proof project', 'LT', 'draft')
  on conflict (id) do nothing;

  -- THE ONLY DIFFERENCE BETWEEN THE TWO PASSES.
  -- One row in the canonical person<->organization table, with an existing
  -- registry slug. No DDL, no new table, no gate rewritten, no new truth store.
  if v_mode then
    insert into public.engagement_contexts
      (profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
    values (v_wrk, v_org, 'freelancer', 'active', false,
            encode(extensions.digest(v_wrk::text || ':freelancer:' || v_org::text, 'sha256'), 'hex'));
  end if;

  v_pass := v_pass || jsonb_build_object('stage','S0 seed','ok',true,
        'worker_id', v_worker, 'employer_worker_autocreated', v_empworker is not null);

  -- =========================================================================
  -- GATE DIAGNOSTICS -- read every authority predicate the loop depends on,
  -- as each actor, BEFORE walking. A stage refusal is only interpretable next
  -- to the gate that produced it.
  -- =========================================================================
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
  v_pass := v_pass || jsonb_build_object('stage','S0 gates (employer)',
        'owns_company',            public.owns_company(v_company),
        'manages_organization',    public.manages_organization(v_org),
        'belongs_to_organization', public.belongs_to_organization(v_org),
        'has_org_demand_access',   public.has_org_demand_access(v_org),
        -- membership_actor_role_v1 is deliberately NOT probed: it is revoked
        -- from `authenticated` and reachable only from inside the definer RPCs
        -- that use it. Calling it would prove nothing about the loop and would
        -- fail the probe on correct hardening.
        'can_manage_project',      public.can_manage_project(v_project));

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_wrk, 'role', 'authenticated')::text, true);
  v_pass := v_pass || jsonb_build_object('stage','S0 gates (worker)',
        'owns_worker',              public.owns_worker(v_worker),
        'belongs_to_organization',  public.belongs_to_organization(v_org),
        'manages_organization',     public.manages_organization(v_org),
        'is_org_member_or_engaged', public.is_org_member_or_engaged_v1(v_org));
  execute 'reset role';

  -- ================= S1  INTEREST ==========================================
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_wrk, 'role', 'authenticated')::text, true);
    insert into public.demand_interest_signals (request_id, worker_id, note)
    values (v_request, v_worker, 'G-01 proof interest');
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('stage','S1 interest','ok',true);
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('stage','S1 interest','ok',false,
          'sqlstate', SQLSTATE, 'message', SQLERRM);
  end;

  -- ================= S2  BOOKING PROPOSED ==================================
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
    v_booking := public.propose_booking_request_v3(
      v_request, v_worker, v_start::text, v_end::text, 'LT',
      'Electrician', 'G-01 proof booking');
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('stage','S2 booking proposed',
          'ok', v_booking is not null, 'booking_id', v_booking);
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('stage','S2 booking proposed','ok',false,
          'sqlstate', SQLSTATE, 'message', SQLERRM);
  end;

  -- ================= S3  ENGAGEMENT ========================================
  -- The engagement must be created in the SAME transaction as the accept.
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_wrk, 'role', 'authenticated')::text, true);
    v_js := public.respond_booking_request_v3(v_booking, 'accepted', null, null);
    execute 'reset role';
    select count(*) into v_n from public.company_worker_engagements e
     where e.source_booking_id = v_booking and e.status = 'active';
    v_pass := v_pass || jsonb_build_object('stage','S3 engagement',
          'ok', (v_js->>'engagement') = 'created' and v_n = 1,
          'rpc', v_js, 'engagement_rows', v_n);
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('stage','S3 engagement','ok',false,
          'sqlstate', SQLSTATE, 'message', SQLERRM);
  end;

  -- ================= S4  ASSIGNMENT ========================================
  -- No roster row exists, so this can only pass on the booking arm.
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
    v_pass := v_pass || jsonb_build_object('stage','S4 gate probe',
          'caller_manages_worker_by_roster', public.caller_manages_worker_by_roster(v_worker),
          'caller_has_booking_engagement_for_project',
            public.caller_has_booking_engagement_for_project(v_worker, v_project));
    perform public.assign_worker_to_project(v_project::text, v_wrk::text);
    execute 'reset role';
    select count(*) into v_n from public.project_worker_assignments a
     where a.project_id = v_project and a.worker_id = v_worker and a.status = 'active';
    v_pass := v_pass || jsonb_build_object('stage','S4 assignment','ok', v_n = 1,
          'assignment_rows', v_n);
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('stage','S4 assignment','ok',false,
          'sqlstate', SQLSTATE, 'message', SQLERRM);
  end;

  -- ================= S5  WORK OBJECTS ======================================
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
    v_txt  := public.create_work_object_v1(v_org::text, 'G-01 Object 01', v_project::text,
                                           'LT', null, 'Vilnius', null, null, null);
    v_txt2 := public.create_work_object_v1(v_org::text, 'G-01 Object 05', v_project::text,
                                           'LT', null, 'Vilnius', null, null, null);
    execute 'reset role';
    select o.id into v_obj01 from public.work_objects o
     where o.organization_id = v_org and o.name = 'G-01 Object 01' limit 1;
    select o.id into v_obj05 from public.work_objects o
     where o.organization_id = v_org and o.name = 'G-01 Object 05' limit 1;
    v_pass := v_pass || jsonb_build_object('stage','S5 work objects',
          'ok', v_obj01 is not null and v_obj05 is not null,
          'outcome_01', v_txt, 'outcome_05', v_txt2);
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('stage','S5 work objects','ok',false,
          'sqlstate', SQLSTATE, 'message', SQLERRM);
  end;

  -- ================= S6  SPLIT HOURS =======================================
  -- The owner's case. 8 h -> Object 01, 2 h -> Object 05. TWO canonical rows.
  -- Not one row of 10 h, not an average, not a rewrite of a previous row.
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
    insert into public.work_hour_allocations
      (organization_id, worker_id, entered_by, work_date, work_object_id,
       hours_numeric, note, source)
    values (v_org, v_worker, v_emp, v_work_date, v_obj01, 8, 'G-01 proof 8h', 'manual'),
           (v_org, v_worker, v_emp, v_work_date, v_obj05, 2, 'G-01 proof 2h', 'manual');
    execute 'reset role';
    select count(*), coalesce(sum(a.hours_numeric), 0) into v_n, v_hours
      from public.work_hour_allocations a
     where a.worker_id = v_worker and a.organization_id = v_org;
    v_pass := v_pass || jsonb_build_object('stage','S6 split hours',
          'ok', v_n = 2 and v_hours = 10,
          'allocation_rows', v_n, 'total_hours', v_hours::text);
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('stage','S6 split hours','ok',false,
          'sqlstate', SQLSTATE, 'message', SQLERRM);
  end;

  -- ================= S7  TIMESHEET =========================================
  -- The WORKER creates their own period document. Totals are DERIVED from the
  -- snapshot lines exactly as the app derives them.
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
      v_pass := v_pass || jsonb_build_object('stage','S7 timesheet',
            'ok', v_n = 2 and v_hours = 10,
            'derived_line_count', v_n, 'derived_total_hours', v_hours::text,
            'source', v_js->'source', 'lines', v_js->'lines');
    else
      v_pass := v_pass || jsonb_build_object('stage','S7 timesheet','ok',false,
            'outcome', v_txt);
    end if;
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('stage','S7 timesheet','ok',false,
          'sqlstate', SQLSTATE, 'message', SQLERRM);
  end;

  -- ================= S8  APPROVAL TEMPLATE =================================
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
    v_pass := v_pass || jsonb_build_object('stage','S8 approval template',
          'ok', v_def is not null, 'outcome', v_js->>'outcome');
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('stage','S8 approval template','ok',false,
          'sqlstate', SQLSTATE, 'message', SQLERRM);
  end;

  -- ================= S8b  THE WEB PATH'S READ ==============================
  -- submitTimesheetAction finds the template through PostgREST, under RLS --
  -- not through the RPC. If the worker cannot SELECT it, the button says
  -- "no template" however healthy the RPC layer is. Probing the RPC alone
  -- would report a loop that closes for nobody using the product.
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_wrk, 'role', 'authenticated')::text, true);
    select count(*)::text into v_txt from public.workflow_definitions d
     where d.organization_id = v_org and d.context_entity_type = 'timesheet' and d.is_active;
    select count(*)::text into v_txt2 from public.workflow_definition_versions v
     where v.definition_id = v_def and v.published_at is not null;
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('stage','S8b worker reads template (web path)',
          'ok', v_txt <> '0' and v_txt2 <> '0',
          'definitions_visible', v_txt, 'published_versions_visible', v_txt2);
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('stage','S8b worker reads template','ok',false,
          'sqlstate', SQLSTATE, 'message', SQLERRM);
  end;

  -- ================= S9  SUBMIT ============================================
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
    v_pass := v_pass || jsonb_build_object('stage','S9 submit',
          'ok', v_txt2 = 'submitted' and v_instance is not null,
          'start_outcome', v_txt, 'submit_outcome', v_txt2);
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('stage','S9 submit','ok',false,
          'sqlstate', SQLSTATE, 'message', SQLERRM);
  end;

  -- ================= S10 REVIEW + APPROVE ==================================
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
    v_txt := public.decide_workflow_step_v1(v_instance::text, 'approved', 'G-01 proof approval');
    execute 'reset role';
    select i.status into v_txt2 from public.workflow_instances i where i.id = v_instance;
    v_pass := v_pass || jsonb_build_object('stage','S10 approve',
          'ok', v_txt2 = 'approved', 'decide_outcome', v_txt, 'instance_status', v_txt2);
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('stage','S10 approve','ok',false,
          'sqlstate', SQLSTATE, 'message', SQLERRM);
  end;

  -- ================= S11 DECISION LANDS ON THE DOCUMENT ====================
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_wrk, 'role', 'authenticated')::text, true);
    v_txt := public.sync_timesheet_decision_v1(v_timesheet::text);
    execute 'reset role';
    select t.status into v_txt2 from public.timesheets t where t.id = v_timesheet;
    v_pass := v_pass || jsonb_build_object('stage','S11 decision lands',
          'ok', v_txt2 = 'approved', 'sync_outcome', v_txt, 'timesheet_status', v_txt2);
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('stage','S11 decision lands','ok',false,
          'sqlstate', SQLSTATE, 'message', SQLERRM);
  end;

  -- ================= FINAL LEDGER ==========================================
  -- The two canonical allocation lines, with provenance.
  v_pass := v_pass || jsonb_build_object('stage','FINAL allocation ledger',
        'lines', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'object', wo.name, 'hours', a.hours_numeric::text,
                   'work_date', a.work_date, 'source', a.source, 'status', a.status,
                   'entered_by_is_employer', a.entered_by = v_emp,
                   'organization_matches', a.organization_id = v_org,
                   'superseded', a.superseded_by is not null) order by wo.name), '[]'::jsonb)
            from public.work_hour_allocations a
            join public.work_objects wo on wo.id = a.work_object_id
           where a.worker_id = v_worker and a.organization_id = v_org));

  v_report := v_report || jsonb_build_object(
    'pass', case when v_mode then 'PASS 2 -- with canonical engagement_contexts row'
                 else 'PASS 1 -- as shipped (booking loop only)' end,
    'relationship_granted', v_mode,
    'stages', v_pass);
end loop;

  raise exception using
    errcode = 'P0001',
    message = 'G01_REPORT ' || v_report::text,
    hint    = 'Deliberate rollback -- the probe never commits.';
end
$g01$;
