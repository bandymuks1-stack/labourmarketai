-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after the lead session's
-- verification. Never `db push`.
-- Gate doc: docs/human-gates/workflow-template-management-gate.md
-- Rollback:  supabase/rollbacks/20260818120000_workflow_template_management_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (3 new SECURITY DEFINER functions
-- + their EXECUTE grants are RED-class; there is no non-RED way to add a
-- gated write path). Annotation pre-approved by owner mandate 2026-08-17
-- (autonomous functional completion train V2, §4 migration authority).
-- SAFETY CLASS: RED — 3 NEW functions, 3 EXECUTE grants, 6 revokes. ZERO new
-- tables, ZERO policies, ZERO triggers, ZERO existing table / policy / grant /
-- trigger / function is modified or recreated, ZERO DML at apply time (the
-- pack installer writes only when an org owner/admin calls it). Depends on
-- 20260817130000_workflow_engine_v1 — asserted in §0 below.
-- Prod apply stays manual by the LEAD session via Supabase MCP.
--
-- 20260818120000 — workflow template MANAGEMENT v1 (one-click default pack +
-- versioned template administration).
--
-- PROBLEM: the canonical Workflow & Approval Engine (20260817130000) ships
-- with three gaps that make it unusable in practice for a real organization:
--   1. Nine engine consumers (timesheets, employee requests, agreements,
--      procurement, business trips, expenses, invoices, management decisions,
--      org document approval) ALL require an ACTIVE definition with a
--      PUBLISHED version before a submission can start. Production currently
--      holds ZERO definitions, so every one of those submissions fails
--      closed. Configuring eight templates by hand, per organization, is the
--      only path that exists today.
--   2. There is NO command to create a new VERSION of an existing
--      definition. `create_workflow_definition_v1` only ever creates version
--      1 of a NEW definition, and a published version's steps are frozen by
--      trigger — so a template can never be changed after publication.
--   3. There is NO command to activate/deactivate a definition, so a
--      template that should stop accepting new requests cannot be retired.
--
-- SOLUTION (three gated commands, no new table, no new vocabulary):
--   * create_workflow_definition_version_v1 — authors version max+1 of an
--     EXISTING definition as a DRAFT (published_at null), with the SAME
--     closed step-vocabulary validation as create_workflow_definition_v1
--     (validated in full BEFORE any write). Publishing stays the engine's
--     own publish_workflow_version_v1.
--   * set_workflow_definition_active_v1 — flips is_active. It touches the
--     definition row and NOTHING else: a running instance carries its own
--     step snapshot and its own resolved approver slots, so deactivating a
--     template can never strand, cancel or alter a request already in
--     flight. `start_workflow_instance_v1` reads is_active, nothing else
--     does.
--   * install_default_workflow_pack_v1 — THE one-click installer. Org
--     owner/admin only, IDEMPOTENT, and it CONSTRUCTS THE STEPS ITSELF: the
--     caller supplies an organization id and nothing else, so this command
--     can never be used to inject an arbitrary approver rule.
--
-- RUNNING INSTANCES ARE IMMUNE, BY CONSTRUCTION (not by convention): at
-- start_workflow_instance_v1 the engine COPIES every step into
-- workflow_instance_steps and RESOLVES every approver into
-- workflow_instance_approvers. Nothing below reads or writes either table.
-- Publishing a new version therefore changes NEW instances only — the engine
-- picks `order by version desc limit 1` among PUBLISHED versions at start
-- time.
--
-- THE DEFAULT PACK — 8 definitions, one step each:
--   slug                        | context             | deadline_hours
--   timesheet_default           | timesheet           | 168  (7 days)
--   employee_request_default    | generic_request     | 168
--   agreement_default           | agreement           | 336  (14 days)
--   procurement_default         | procurement         | 168
--   business_trip_default       | business_trip       | 168
--   expense_default             | expense             | 168
--   invoice_default             | invoice             | 168
--   management_decision_default | management_decision | 336
-- Every step: approval_mode 'single', approver_rule
-- {"kind":"org_role","roles":["owner","admin"]}, escalation_rule
-- {"action":"mark_escalated","notify_roles":["owner","admin"]}.
--
-- EXACTLY ONE generic_request DEFINITION — DELIBERATE AND LOAD-BEARING.
-- Two engine consumers resolve through the generic_request context:
--   * employee requests resolve BY SLUG (`employee_request_<type>`, falling
--     back to the slug `employee_request_default`), and
--   * org document approval resolves BY CONTEXT — it takes the org's active
--     published 'generic_request' definitions and picks one with a plain
--     `.find()` over an UNORDERED PostgREST result.
-- A second seeded generic_request definition would therefore make document
-- approval route non-deterministically between two templates from one page
-- load to the next. The pack seeds `employee_request_default` and nothing
-- else in that context, and the installer's per-context skip rule keeps a
-- second one from being added by a repeat install.
--
-- WHY org_role[owner,admin] AND NOT requester_manager — STATED HONESTLY.
-- The engine's `requester_manager` rule resolves to every active managing
-- membership MINUS the requester. Production today holds 13 organizations;
-- 12 of them are single-person (one active `owner` membership and nothing
-- else) and exactly one has a `manager`. Under `requester_manager` those 12
-- orgs resolve to ZERO approvers, and `start_workflow_instance_v1` refuses
-- an unapprovable request with 'no_approvers' — every submission would fail
-- closed and the pack would deliver nothing. `org_role[owner,admin]`
-- resolves for all 13 organizations today.
--
-- THE CONSEQUENCE, ALSO STATED HONESTLY (and surfaced in the UI copy, not
-- only here): in a SINGLE-PERSON organization the owner is the only resolved
-- approver, so the owner approves their own submissions. The audit ledger
-- records that truthfully — requester and approver are the same profile id,
-- and nothing pretends a second person reviewed it. An organization that
-- grows should add a second owner/admin and publish a new version of the
-- affected templates (create_workflow_definition_version_v1 +
-- publish_workflow_version_v1 exist for exactly that).
--
-- ESCALATION NEVER APPROVES: the pack's escalation_rule is the engine's ONLY
-- admitted action, 'mark_escalated'. The engine's closed vocabulary forbids
-- anything else and this migration does not widen it.
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   - NO new table, NO new column, NO new policy, NO new trigger;
--   - NO widening of the approver-rule, escalation, mode or context
--     vocabularies — every value written below already passes the engine's
--     own CHECK constraints and its own create-command validation;
--   - NO auto-install anywhere: an org owner/admin must call the installer;
--   - NO scheduler, NO cron, NO backfill, NO DML at apply time;
--   - NO deletion path for definitions (retiring one is is_active = false,
--     which preserves the audit trail of everything it ever approved);
--   - NO external sending of any kind, NO AI.
--
-- RLS DECISION, STATED EXPLICITLY:
--   No table gains or loses a policy here. The engine's posture is unchanged:
--   anon has nothing; authenticated keeps SELECT-only on the seven engine
--   tables; writes remain RPC-only. These three commands are SECURITY
--   DEFINER with a pinned search_path, re-derive the actor from auth.uid(),
--   and re-check authority through public.membership_actor_role_v1 exactly
--   like the engine's own create/publish/cancel commands. EXECUTE is revoked
--   from public and anon and granted to authenticated only.
--
-- ROLLBACK: supabase/rollbacks/20260818120000_workflow_template_management_v1.down.sql
-- drops ONLY these 3 functions. It creates nothing and deletes no row: a
-- definition the installer created is ordinary engine data and is left
-- exactly as it is (dropping it would destroy the approval history of every
-- instance that ran on it).
-- ============================================================================

begin;

-- ── 0. Safety assertions — the engine this extends must already exist ───────
do $$
begin
  if to_regclass('public.workflow_definitions') is null
     or to_regclass('public.workflow_definition_versions') is null
     or to_regclass('public.workflow_version_steps') is null then
    raise exception 'workflow engine missing — apply 20260817130000_workflow_engine_v1 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'membership_actor_role_v1'
  ) then
    raise exception 'membership_actor_role_v1 missing — apply 20260806120000 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'publish_workflow_version_v1'
  ) then
    raise exception 'publish_workflow_version_v1 missing — apply 20260817130000 before this migration';
  end if;
end $$;

-- ── 1. create_workflow_definition_version_v1 ────────────────────────────────
-- Authors version max(version)+1 of an EXISTING definition as a DRAFT.
-- Every step is validated BEFORE any write, with the SAME closed vocabulary
-- create_workflow_definition_v1 enforces:
--   approval_mode  ∈ {single, all, any}
--   approver_rule  ∈ { {"kind":"org_role","roles":[...]},
--                      {"kind":"profiles","profile_ids":[...]},
--                      {"kind":"requester_manager"} }
--   deadline_hours ∈ [1, 2160]
--   escalation_rule action MUST be 'mark_escalated' — no other action exists.
-- Returns the new version id as uuid-as-text on success (the engine's
-- start_workflow_instance_v1 precedent); a short outcome string otherwise.
create or replace function public.create_workflow_definition_version_v1(
  p_definition_id text,
  p_steps         jsonb
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_def_id   uuid;
  v_def      record;
  actor_role text;
  v_next     int;
  v_ver      uuid;
  v_step     jsonb;
  v_i        int := 0;
  v_mode     text;
  v_rule     jsonb;
  v_kind     text;
  v_dl       int;
  v_esc      jsonb;
  v_r        text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  begin
    v_def_id := nullif(trim(coalesce(p_definition_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_def_id is null then return 'invalid'; end if;

  -- Serialize concurrent version authoring on the same definition so the
  -- max(version)+1 read and the insert cannot race into a unique violation.
  select d.id, d.organization_id
    into v_def
    from public.workflow_definitions d
   where d.id = v_def_id
   for update;
  if v_def.id is null then return 'not_found'; end if;

  -- Merged outcome for "definition missing" and "no authority" — no oracle.
  actor_role := public.membership_actor_role_v1(uid, v_def.organization_id);
  if actor_role is null or actor_role not in ('owner','admin') then
    return 'not_found';
  end if;

  if p_steps is null or jsonb_typeof(p_steps) <> 'array'
     or jsonb_array_length(p_steps) < 1 or jsonb_array_length(p_steps) > 20 then
    return 'invalid';
  end if;

  -- Validate every step BEFORE any write.
  for v_step in select * from jsonb_array_elements(p_steps) loop
    if jsonb_typeof(v_step) <> 'object' then return 'invalid'; end if;
    if nullif(trim(coalesce(v_step->>'name', '')), '') is null
       or char_length(trim(v_step->>'name')) < 2
       or char_length(v_step->>'name') > 120 then
      return 'invalid';
    end if;
    v_mode := v_step->>'approval_mode';
    if v_mode is null or v_mode not in ('single','all','any') then return 'invalid'; end if;
    v_rule := v_step->'approver_rule';
    if v_rule is null or jsonb_typeof(v_rule) <> 'object' then return 'invalid'; end if;
    v_kind := v_rule->>'kind';
    if v_kind = 'org_role' then
      if jsonb_typeof(v_rule->'roles') <> 'array' or jsonb_array_length(v_rule->'roles') < 1 then
        return 'invalid';
      end if;
      for v_r in select jsonb_array_elements_text(v_rule->'roles') loop
        if v_r not in ('owner','admin','manager','external_manager','member') then
          return 'invalid';
        end if;
      end loop;
    elsif v_kind = 'profiles' then
      if jsonb_typeof(v_rule->'profile_ids') <> 'array'
         or jsonb_array_length(v_rule->'profile_ids') < 1
         or jsonb_array_length(v_rule->'profile_ids') > 20 then
        return 'invalid';
      end if;
      begin
        perform (jsonb_array_elements_text(v_rule->'profile_ids'))::uuid;
      exception when invalid_text_representation then
        return 'invalid';
      end;
    elsif v_kind = 'requester_manager' then
      null; -- no extra fields
    else
      return 'invalid';
    end if;
    if v_step ? 'deadline_hours' and jsonb_typeof(v_step->'deadline_hours') <> 'null' then
      begin
        v_dl := (v_step->>'deadline_hours')::int;
      exception when others then
        return 'invalid';
      end;
      if v_dl < 1 or v_dl > 2160 then return 'invalid'; end if;
    end if;
    v_esc := v_step->'escalation_rule';
    if v_esc is not null and jsonb_typeof(v_esc) = 'object' then
      -- v1 closed vocabulary: mark + notify only. NEVER an approve action.
      if coalesce(v_esc->>'action', '') <> 'mark_escalated' then return 'invalid'; end if;
      if v_esc ? 'notify_roles' then
        if jsonb_typeof(v_esc->'notify_roles') <> 'array' then return 'invalid'; end if;
        for v_r in select jsonb_array_elements_text(v_esc->'notify_roles') loop
          if v_r not in ('owner','admin','manager','external_manager') then
            return 'invalid';
          end if;
        end loop;
      end if;
    elsif v_esc is not null and jsonb_typeof(v_esc) <> 'null' then
      return 'invalid';
    end if;
  end loop;

  -- Abuse cap: a version history is an audit trail, not a data dump.
  select coalesce(max(v.version), 0) + 1
    into v_next
    from public.workflow_definition_versions v
   where v.definition_id = v_def.id;
  if v_next > 50 then return 'limit_reached'; end if;

  insert into public.workflow_definition_versions (definition_id, version, created_by)
  values (v_def.id, v_next, uid)
  returning id into v_ver;

  v_i := 0;
  for v_step in select * from jsonb_array_elements(p_steps) loop
    v_i := v_i + 1;
    insert into public.workflow_version_steps
      (version_id, step_order, name, approval_mode, approver_rule, deadline_hours, escalation_rule)
    values
      (v_ver, v_i, trim(v_step->>'name'), v_step->>'approval_mode', v_step->'approver_rule',
       case when v_step ? 'deadline_hours' and jsonb_typeof(v_step->'deadline_hours') <> 'null'
            then (v_step->>'deadline_hours')::int else null end,
       case when jsonb_typeof(v_step->'escalation_rule') = 'object'
            then v_step->'escalation_rule' else null end);
  end loop;

  return v_ver::text;
end;
$$;
revoke all on function public.create_workflow_definition_version_v1(text, jsonb) from public;
revoke all on function public.create_workflow_definition_version_v1(text, jsonb) from anon;
grant execute on function public.create_workflow_definition_version_v1(text, jsonb) to authenticated;

-- ── 2. set_workflow_definition_active_v1 ────────────────────────────────────
-- Flips is_active on ONE definition. It reads and writes public
-- .workflow_definitions and NOTHING else: no instance, no instance step, no
-- approver slot and no transition is read or touched, so a request already
-- in flight is unaffected in every way. Only start_workflow_instance_v1
-- consults is_active, and only for a NEW request.
create or replace function public.set_workflow_definition_active_v1(
  p_definition_id text,
  p_is_active     text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_def_id   uuid;
  v_def      record;
  actor_role text;
  v_flag     text := lower(nullif(trim(coalesce(p_is_active, '')), ''));
  v_target   boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  begin
    v_def_id := nullif(trim(coalesce(p_definition_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_def_id is null then return 'invalid'; end if;
  if v_flag is null or v_flag not in ('true','false') then return 'invalid'; end if;
  v_target := (v_flag = 'true');

  select d.id, d.organization_id, d.is_active
    into v_def
    from public.workflow_definitions d
   where d.id = v_def_id;
  if v_def.id is null then return 'not_found'; end if;

  -- Merged outcome for "definition missing" and "no authority" — no oracle.
  actor_role := public.membership_actor_role_v1(uid, v_def.organization_id);
  if actor_role is null or actor_role not in ('owner','admin') then
    return 'not_found';
  end if;

  if v_def.is_active = v_target then
    return case when v_target then 'already_active' else 'already_inactive' end;
  end if;

  update public.workflow_definitions
     set is_active = v_target,
         updated_at = now()
   where id = v_def.id;

  return case when v_target then 'activated' else 'deactivated' end;
end;
$$;
revoke all on function public.set_workflow_definition_active_v1(text, text) from public;
revoke all on function public.set_workflow_definition_active_v1(text, text) from anon;
grant execute on function public.set_workflow_definition_active_v1(text, text) to authenticated;

-- ── 3. install_default_workflow_pack_v1 ─────────────────────────────────────
-- The one-click installer. Org owner/admin only. IDEMPOTENT: for each of the
-- eight pack contexts, if the organization ALREADY has an active definition
-- with a published version for that context, the entry is SKIPPED; otherwise
-- the definition + version 1 + its single step are created and the version is
-- published in the same transaction. A second call is therefore all-skips.
--
-- The steps are CONSTRUCTED HERE, from the literal pack below. The caller
-- supplies an organization id and nothing else — this command cannot be used
-- to inject an arbitrary approver rule, deadline or escalation action.
--
-- Returns { "outcome": ..., "installed": [...], "skipped": [...] }.
create or replace function public.install_default_workflow_pack_v1(
  p_organization_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid         uuid := auth.uid();
  v_org       uuid;
  actor_role  text;
  v_pack      jsonb;
  v_entry     jsonb;
  v_slug      text;
  v_ctx       text;
  v_name      text;
  v_step_name text;
  v_dl        int;
  v_def       uuid;
  v_ver       uuid;
  v_count     int;
  v_installed jsonb := '[]'::jsonb;
  v_skipped   jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  begin
    v_org := nullif(trim(coalesce(p_organization_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('outcome', 'invalid', 'installed', v_installed, 'skipped', v_skipped);
  end;
  if v_org is null then
    return jsonb_build_object('outcome', 'invalid', 'installed', v_installed, 'skipped', v_skipped);
  end if;

  -- Merged outcome for "org missing" and "no authority" — no oracle.
  actor_role := public.membership_actor_role_v1(uid, v_org);
  if actor_role is null or actor_role not in ('owner','admin') then
    return jsonb_build_object('outcome', 'not_authorized', 'installed', v_installed, 'skipped', v_skipped);
  end if;

  -- THE PACK. Literal, server-side, never caller-supplied. EXACTLY ONE
  -- 'generic_request' entry (employee_request_default) — see the header.
  v_pack := '[
    {"slug":"timesheet_default","context_entity_type":"timesheet","name":"Timesheet approval","step_name":"Manager approval","deadline_hours":168},
    {"slug":"employee_request_default","context_entity_type":"generic_request","name":"Employee request approval","step_name":"Manager approval","deadline_hours":168},
    {"slug":"agreement_default","context_entity_type":"agreement","name":"Agreement internal approval","step_name":"Internal approval","deadline_hours":336},
    {"slug":"procurement_default","context_entity_type":"procurement","name":"Purchase approval","step_name":"Purchase approval","deadline_hours":168},
    {"slug":"business_trip_default","context_entity_type":"business_trip","name":"Business trip approval","step_name":"Trip approval","deadline_hours":168},
    {"slug":"expense_default","context_entity_type":"expense","name":"Expense approval","step_name":"Expense approval","deadline_hours":168},
    {"slug":"invoice_default","context_entity_type":"invoice","name":"Incoming invoice approval","step_name":"Invoice approval","deadline_hours":168},
    {"slug":"management_decision_default","context_entity_type":"management_decision","name":"Management decision","step_name":"Decision approval","deadline_hours":336}
  ]'::jsonb;

  for v_entry in select * from jsonb_array_elements(v_pack) loop
    v_slug      := v_entry->>'slug';
    v_ctx       := v_entry->>'context_entity_type';
    v_name      := v_entry->>'name';
    v_step_name := v_entry->>'step_name';
    v_dl        := (v_entry->>'deadline_hours')::int;

    -- IDEMPOTENCY RULE 1 — the context is already covered by a live template.
    if exists (
      select 1
        from public.workflow_definitions d
        join public.workflow_definition_versions v on v.definition_id = d.id
       where d.organization_id = v_org
         and d.context_entity_type = v_ctx
         and d.is_active
         and v.published_at is not null
    ) then
      v_skipped := v_skipped || jsonb_build_object(
        'slug', v_slug, 'context_entity_type', v_ctx, 'reason', 'context_already_covered');
      continue;
    end if;

    -- IDEMPOTENCY RULE 2 — the pack's own slug is taken (e.g. an inactive or
    -- still-unpublished earlier install). Never silently overwrite it.
    if exists (
      select 1 from public.workflow_definitions d
       where d.organization_id = v_org and d.slug = v_slug
    ) then
      v_skipped := v_skipped || jsonb_build_object(
        'slug', v_slug, 'context_entity_type', v_ctx, 'reason', 'slug_already_exists');
      continue;
    end if;

    -- The engine's own per-org template cap, honoured here too.
    select count(*) into v_count
      from public.workflow_definitions d
     where d.organization_id = v_org;
    if v_count >= 50 then
      v_skipped := v_skipped || jsonb_build_object(
        'slug', v_slug, 'context_entity_type', v_ctx, 'reason', 'limit_reached');
      continue;
    end if;

    insert into public.workflow_definitions
      (organization_id, slug, name, context_entity_type, created_by)
    values (v_org, v_slug, v_name, v_ctx, uid)
    returning id into v_def;

    insert into public.workflow_definition_versions (definition_id, version, created_by)
    values (v_def, 1, uid)
    returning id into v_ver;

    -- ONE step, org owners+admins decide, escalation MARKS only.
    insert into public.workflow_version_steps
      (version_id, step_order, name, approval_mode, approver_rule, deadline_hours, escalation_rule)
    values
      (v_ver, 1, v_step_name, 'single',
       '{"kind":"org_role","roles":["owner","admin"]}'::jsonb,
       v_dl,
       '{"action":"mark_escalated","notify_roles":["owner","admin"]}'::jsonb);

    -- Publish LAST: the engine's frozen-steps trigger only allows step
    -- writes while published_at is null.
    update public.workflow_definition_versions
       set published_at = now()
     where id = v_ver and published_at is null;

    v_installed := v_installed || jsonb_build_object(
      'slug', v_slug, 'context_entity_type', v_ctx, 'name', v_name);
  end loop;

  return jsonb_build_object(
    'outcome',
    case when jsonb_array_length(v_installed) > 0 then 'installed' else 'all_skipped' end,
    'installed', v_installed,
    'skipped', v_skipped
  );
end;
$$;
revoke all on function public.install_default_workflow_pack_v1(text) from public;
revoke all on function public.install_default_workflow_pack_v1(text) from anon;
grant execute on function public.install_default_workflow_pack_v1(text) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260818120000_workflow_template_management_v1.down.sql
-- drops exactly these three functions and nothing else. It creates nothing
-- and deletes no row — definitions the installer created are ordinary engine
-- data and stay exactly as they are.
