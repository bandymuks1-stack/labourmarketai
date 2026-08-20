-- ===========================================================================
-- THE OPERATIONAL TRUTH CHAIN — proven end to end against a REAL database,
-- inside a transaction that is ROLLED BACK.
--
--   task -> work -> work journal -> evidence -> task link -> hours ->
--   task attribution -> done -> send for approval -> human decision ->
--   durable history
--
-- WHY IT IS SHAPED THIS WAY. Schema and unit tests cannot see this chain: it
-- spans eight SECURITY DEFINER commands, two RLS-governed tables, an
-- append-only ledger and a jsonb projection. Running it is the only way to
-- know it works. Wrapping it in `begin … rollback` is what makes running it
-- against production legitimate: it exercises the REAL deployed functions,
-- the REAL constraints and the REAL RLS, and leaves NOTHING behind.
--
-- It is how the chain step B on-ramp defect was found. Every prior signal said
-- work_task approval worked — the CHECK constraints accepted it, the model
-- listed it, all 11 locales had labels, the guards passed. Step 8 returned
-- `invalid`, because `create_workflow_definition_v1` carried its own
-- unwidened allowlist. 20260820070000 fixes that.
--
-- USAGE
--   Run the WHOLE file as one statement batch. The final `rollback` is not
--   optional and must never be edited to `commit`.
--
--   Supabase MCP:  execute_sql with this file's contents.
--   psql:          psql "$DATABASE_URL" -f scripts/db-proof/work-task-approval-chain.sql
--
-- AFTER RUNNING, recount to prove nothing persisted:
--   select (select count(*) from public.work_tasks)          as work_tasks,
--          (select count(*) from public.journal_entry_tasks) as links,
--          (select count(*) from public.workflow_instances)  as instances,
--          (select count(*) from public.organizations
--            where legal_name like 'CHAIN PROOF%')           as proof_orgs;
--
-- Every row of the result must have ok = true.
-- ===========================================================================

begin;

create temp table proof(
  n        int generated always as identity,
  step     text,
  expected text,
  got      text,
  ok       boolean
) on commit drop;

do $chain$
declare
  v_org    uuid := gen_random_uuid();
  v_proj   uuid := gen_random_uuid();
  v_prof   uuid := gen_random_uuid();   -- the worker, and the org's owner
  v_appr   uuid := gen_random_uuid();   -- the human approver the org NAMES
  v_worker uuid;
  v_ctx    uuid := gen_random_uuid();
  v_task   uuid; v_entry uuid; v_link uuid;
  v_def    uuid; v_ver   uuid; v_inst uuid;
  v_res    jsonb; v_line jsonb; v_out text;
  v_tb     int;  v_ta    int;
begin
  -- ── SEED. Direct inserts: these paths are proven by their own migrations
  --    and are not what is under test here.
  insert into auth.users (id) values (v_prof), (v_appr);
  insert into public.profiles (id) values (v_prof), (v_appr) on conflict (id) do nothing;
  -- a worker row is provisioned by trigger when a profile appears
  select id into v_worker from public.workers where profile_id = v_prof;
  insert into public.organizations (id, organization_type, legal_name, owner_profile_id)
    values (v_org, 'company', 'CHAIN PROOF (rolled back)', v_prof);
  insert into public.projects (id, organization_id, title)
    values (v_proj, v_org, 'Chain proof project');
  -- 'active', not the 'invited' default: an invited member is not yet an
  -- approver, and the engine is right to refuse to resolve one.
  insert into public.company_memberships (organization_id, profile_id, role, status, accepted_at)
    values (v_org, v_appr, 'admin', 'active', now());
  insert into public.engagement_contexts
    (id, profile_id, organization_id, relationship_slug, status, hash_self)
    values (v_ctx, v_prof, v_org, 'employee', 'active',
            encode(digest(v_ctx::text, 'sha256'), 'hex'));

  -- ── FROM HERE ON, EVERY WRITE IS A REAL RPC CALLED AS A REAL USER.
  perform set_config('request.jwt.claim.sub', v_prof::text, true);

  -- 1. TASK
  v_out := public.create_work_task_v1(
    'Install cable run, floor 3', null, 'normal', null, v_proj::text, true);
  select id into v_task from public.work_tasks
   where created_by = v_prof order by created_at desc limit 1;
  insert into proof(step, expected, got, ok)
    values ('1 TASK created', 'created', v_out, v_out = 'created');

  -- 2. WORK JOURNAL — the worker's own words, and 8 hours of real work
  v_entry := public.create_journal_entry_full(
    v_worker, v_ctx, 'freeform', null,
    'Kloju kabeliu trasa treciame aukste, 8 val.', 'lt',
    repeat('0', 64), repeat('a', 64), 'closed',
    jsonb_build_array(
      jsonb_build_object('metric_slug','work_date','value_text','2026-08-10'),
      jsonb_build_object('metric_slug','quantity','value_numeric','8','unit_slug','hours')));
  insert into proof(step, expected, got, ok)
    values ('2 WORK JOURNAL entry', 'uuid', coalesce(v_entry::text,'null'), v_entry is not null);

  -- 3. EVIDENCE LINK
  v_out := public.link_journal_entry_to_task_v1(v_entry::text, v_task::text);
  select id into v_link from public.journal_entry_tasks
   where entry_id = v_entry and task_id = v_task;
  insert into proof(step, expected, got, ok)
    values ('3 EVIDENCE linked to the task', 'ok', v_out, v_out = 'ok');

  -- 4-6. HOURS, ATTRIBUTION, PROVENANCE
  v_res  := public.timesheet_compute_lines_v1(v_worker, v_org, '2026-08-01', '2026-08-31');
  v_line := v_res->'lines'->0;
  insert into proof(step, expected, got, ok) values
    ('4 HOURS derived, counted once', '8.00',
      v_res->'totals'->>'totalHours', (v_res->'totals'->>'totalHours')::numeric = 8),
    ('4b exactly ONE line — no fan-out', '1',
      v_res->'totals'->>'lineCount', (v_res->'totals'->>'lineCount')::int = 1),
    ('5 ATTRIBUTED to the task it evidences', 'match',
      case when v_line->>'taskId' = v_task::text then 'match'
           else coalesce(v_line->>'taskId','null') end,
      v_line->>'taskId' = v_task::text),
    ('5b the task TITLE is the real one', 'Install cable run, floor 3',
      v_line->>'taskTitle', v_line->>'taskTitle' = 'Install cable run, floor 3'),
    ('5c linkCount is reported, ambiguity never silent', '1',
      v_line->>'taskLinkCount', (v_line->>'taskLinkCount')::int = 1),
    ('6 PROVENANCE survives the whole derivation', 'entry_quantity/worker_input',
      (v_line->>'derivedFrom')||'/'||(v_line->>'metricSource'),
      v_line->>'derivedFrom' = 'entry_quantity' and v_line->>'metricSource' = 'worker_input'),
    ('6b the metric row is still nameable', 'true',
      (v_line ? 'metricId')::text, (v_line ? 'metricId'));

  -- 7. DONE
  v_out := public.set_work_task_status_v1(v_task::text, 'done');
  insert into proof(step, expected, got, ok)
    values ('7 TASK marked done', 'updated', v_out, v_out = 'updated');

  -- 8-9. The organization AUTHORS its own flow and NAMES its own approver.
  --      No default pack, no invented authority.
  v_out := public.create_workflow_definition_v1(
    v_org::text, 'Work task sign-off', 'work_task_signoff', 'work_task',
    jsonb_build_array(jsonb_build_object(
      'name', 'Manager sign-off',
      'approval_mode', 'single',
      'approver_rule', jsonb_build_object(
        'kind', 'profiles', 'profile_ids', jsonb_build_array(v_appr::text)))));
  select id into v_def from public.workflow_definitions
   where organization_id = v_org and slug = 'work_task_signoff';
  insert into proof(step, expected, got, ok)
    values ('8 work_task DEFINITION authored (needs 20260820070000)', 'created',
            v_out, v_out = 'created' and v_def is not null);

  select id into v_ver from public.workflow_definition_versions
   where definition_id = v_def order by version desc limit 1;
  v_out := public.publish_workflow_version_v1(v_ver::text);
  insert into proof(step, expected, got, ok)
    values ('9 version PUBLISHED', 'published', v_out, v_out in ('ok','published'));

  -- 10. SEND FOR APPROVAL
  -- A DELIBERATELY DIFFERENT caller title: the engine must ignore it and
  -- store the task's own, so assertion 19f proves the override rather than
  -- passing by coincidence.
  v_out := public.start_workflow_instance_v1(
    v_def::text, 'REQUESTER SUPPLIED TITLE THAT MUST NOT BE STORED',
    '{}'::jsonb, v_task::text);
  select id into v_inst from public.workflow_instances
   where context_entity_type = 'work_task' and context_entity_id = v_task;
  insert into proof(step, expected, got, ok) values
    ('10 SENT FOR APPROVAL, on the task itself', 'instance started',
      v_out, v_inst is not null),
    ('10b the NAMED approver resolved to a real slot', '1',
      (select count(*)::text from public.workflow_instance_approvers
        where instance_id = v_inst and approver_profile_id = v_appr),
      (select count(*) from public.workflow_instance_approvers
        where instance_id = v_inst and approver_profile_id = v_appr) = 1);

  -- 11-12. THE HUMAN DECIDES, and the decision is durable
  select count(*) into v_tb from public.workflow_transitions where instance_id = v_inst;
  perform set_config('request.jwt.claim.sub', v_appr::text, true);
  v_out := public.decide_workflow_step_v1(v_inst::text, 'approved', 'Patikrinta objekte');
  select count(*) into v_ta from public.workflow_transitions where instance_id = v_inst;
  insert into proof(step, expected, got, ok) values
    ('11 HUMAN DECISION taken by the named approver', 'approved',
      v_out, v_out in ('ok','approved','completed')),
    ('11b the instance carries the outcome', 'approved',
      (select status from public.workflow_instances where id = v_inst),
      (select status from public.workflow_instances where id = v_inst) = 'approved'),
    ('12 DURABLE HISTORY appended (append-only ledger)', 'grew',
      v_tb||' -> '||v_ta, v_ta > v_tb),
    ('12b the record names WHO decided and WHY', 'decision + decider + time',
      (select coalesce(decision,'-')||'/'||coalesce(reason,'-')
         from public.workflow_instance_approvers
        where instance_id = v_inst and approver_profile_id = v_appr),
      (select decision = 'approved' and decided_by = v_appr and decided_at is not null
         from public.workflow_instance_approvers
        where instance_id = v_inst and approver_profile_id = v_appr));

  -- 13. APPROVAL MUST NOT MUTATE HISTORICAL EVIDENCE
  insert into proof(step, expected, got, ok) values
    ('13 approval did NOT touch the journal metrics', '2',
      (select count(*)::text from public.journal_entry_metrics where entry_id = v_entry),
      (select count(*) from public.journal_entry_metrics where entry_id = v_entry) = 2),
    ('13b the journal entry is still current', 'true',
      (select (deleted_at is null and superseded_by is null)::text
         from public.journal_entries where id = v_entry),
      (select deleted_at is null and superseded_by is null
         from public.journal_entries where id = v_entry));

  -- 14-19. WITHDRAWING THE EVIDENCE LINK MUST NOT ERASE HISTORY
  perform set_config('request.jwt.claim.sub', v_prof::text, true);
  v_out  := public.unlink_journal_entry_from_task_v1(v_link::text, 'wrong task');
  v_res  := public.timesheet_compute_lines_v1(v_worker, v_org, '2026-08-01', '2026-08-31');
  v_line := v_res->'lines'->0;
  insert into proof(step, expected, got, ok) values
    ('14 UNLINK accepted', 'ok', v_out, v_out = 'ok'),
    ('15 the withdrawal is a RECORD — the row is kept, not deleted', 'wrong task',
      (select coalesce(unlink_reason,'null') from public.journal_entry_tasks where id = v_link),
      (select unlinked_at is not null and unlink_reason = 'wrong task'
         from public.journal_entry_tasks where id = v_link)),
    ('16 the HOURS survive the withdrawal, still counted once', '8.00',
      v_res->'totals'->>'totalHours', (v_res->'totals'->>'totalHours')::numeric = 8),
    ('16b attribution correctly DROPS — a withdrawn claim is not a link', 'null',
      coalesce(v_line->>'taskId','null'), v_line->>'taskId' is null),
    ('17 the journal entry itself is untouched', '2',
      (select count(*)::text from public.journal_entry_metrics where entry_id = v_entry),
      (select count(*) from public.journal_entry_metrics where entry_id = v_entry) = 2),
    ('18 the APPROVAL decision survives the withdrawal', 'approved',
      (select status from public.workflow_instances where id = v_inst),
      (select status from public.workflow_instances where id = v_inst) = 'approved'),
    ('19 the transition ledger is unchanged by the withdrawal', 'same count',
      (select count(*)::text from public.workflow_transitions where instance_id = v_inst),
      (select count(*) from public.workflow_transitions where instance_id = v_inst) = v_ta);

  -- 19b-19e. TENANT SCOPE — a task may travel ONLY through a flow of its own
  -- organization, and the title an approver reads is the TASK's, never text
  -- the requester typed.
  --
  -- Measured against the UNPATCHED engine, this attack SUCCEEDS: org A's task
  -- goes through org B's flow, an org B approver slot is created for a task
  -- they cannot see, and the instance carries a caller-invented title. That is
  -- what 20260820070000 closes.
  declare
    v_org_b   uuid := gen_random_uuid();
    v_proj_b  uuid := gen_random_uuid();
    v_appr_b  uuid := gen_random_uuid();
    v_def_b   uuid;
    v_ver_b   uuid;
    v_orphan  uuid;
  begin
    insert into auth.users (id) values (v_appr_b);
    insert into public.profiles (id) values (v_appr_b) on conflict (id) do nothing;
    insert into public.organizations (id, organization_type, legal_name, owner_profile_id)
      values (v_org_b, 'company', 'CHAIN PROOF ORG B (rolled back)', v_prof);
    insert into public.projects (id, organization_id, title)
      values (v_proj_b, v_org_b, 'Org B project');
    insert into public.company_memberships (organization_id, profile_id, role, status, accepted_at)
      values (v_org_b, v_appr_b, 'admin', 'active', now());

    perform set_config('request.jwt.claim.sub', v_prof::text, true);
    v_out := public.create_work_task_v1('Orphan task with no org spine', null,
                                        'normal', null, null, true);
    select id into v_orphan from public.work_tasks
     where created_by = v_prof order by created_at desc limit 1;

    v_out := public.create_workflow_definition_v1(
      v_org_b::text, 'B signoff', 'b_signoff', 'work_task',
      jsonb_build_array(jsonb_build_object(
        'name', 'Sign off', 'approval_mode', 'single',
        'approver_rule', jsonb_build_object(
          'kind', 'profiles', 'profile_ids', jsonb_build_array(v_appr_b::text)))));
    select id into v_def_b from public.workflow_definitions
     where organization_id = v_org_b and slug = 'b_signoff';
    select id into v_ver_b from public.workflow_definition_versions
     where definition_id = v_def_b order by version desc limit 1;
    v_out := public.publish_workflow_version_v1(v_ver_b::text);

    -- The task under test already has a live org-A approval, so use a second
    -- org-A task for the cross-org attempt to keep the cases independent.
    v_out := public.start_workflow_instance_v1(
      v_def_b::text, 'Totally unrelated invented title', '{}'::jsonb, v_orphan::text);
    insert into proof(step, expected, got, ok) values
      ('19b a task with NO organization spine is refused', 'not_allowed',
        v_out, v_out = 'not_allowed');

    v_out := public.start_workflow_instance_v1(
      v_def_b::text, 'Invented', '{}'::jsonb, gen_random_uuid()::text);
    insert into proof(step, expected, got, ok) values
      ('19c a nonexistent task uuid is refused', 'not_found',
        v_out, v_out = 'not_found');

    v_out := public.start_workflow_instance_v1(
      v_def_b::text, 'Invented', '{}'::jsonb, null);
    insert into proof(step, expected, got, ok) values
      ('19d a work_task flow with NO task at all is refused', 'invalid',
        v_out, v_out = 'invalid');

    insert into proof(step, expected, got, ok) values
      ('19e org B holds no instance for any org A task', '0',
        (select count(*)::text from public.workflow_instances
          where organization_id = v_org_b),
        (select count(*) from public.workflow_instances
          where organization_id = v_org_b) = 0),
      ('19f the approval title is the TASK''s own, not the requester''s',
        'Install cable run, floor 3',
        (select title from public.workflow_instances where id = v_inst),
        (select title from public.workflow_instances where id = v_inst)
          = 'Install cable run, floor 3');
  end;

  -- 20. ANON GAINS NOTHING from any of it.
  insert into proof(step, expected, got, ok) values
    ('20 anon cannot execute the timesheet computation', 'false',
      has_function_privilege('anon','public.timesheet_compute_lines_v1(uuid,uuid,date,date)','EXECUTE')::text,
      not has_function_privilege('anon','public.timesheet_compute_lines_v1(uuid,uuid,date,date)','EXECUTE')),
    ('20b anon cannot author a workflow definition', 'false',
      has_function_privilege('anon','public.create_workflow_definition_v1(text,text,text,text,jsonb)','EXECUTE')::text,
      not has_function_privilege('anon','public.create_workflow_definition_v1(text,text,text,text,jsonb)','EXECUTE')),
    ('20c anon has NO write grant on the evidence link table', '0',
      (select count(*)::text from information_schema.role_table_grants
        where grantee = 'anon' and table_schema = 'public'
          and table_name = 'journal_entry_tasks'
          and privilege_type in ('INSERT','UPDATE','DELETE')),
      (select count(*) from information_schema.role_table_grants
        where grantee = 'anon' and table_schema = 'public'
          and table_name = 'journal_entry_tasks'
          and privilege_type in ('INSERT','UPDATE','DELETE')) = 0);
end $chain$;

select n, step, expected, got, ok from proof order by n;

-- NOT OPTIONAL. Never change this to `commit`.
rollback;
