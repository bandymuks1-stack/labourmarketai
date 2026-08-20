-- ============================================================================
-- ROLLBACK for 20260820070000_workflow_work_task_definition_v1.
--
-- Restores the 20260817130000 allowlist verbatim: 'work_task' is removed from
-- the contexts an organization may author a definition for.
--
-- IT REFUSES while any work_task definition exists. Removing the value would
-- not delete those rows — the TABLE check constraint widened by 20260819210000
-- still accepts them — but it would leave a live approval flow that its own
-- organization could never recreate, edit or reason about. Orphaning a live
-- flow is a data decision for the owner, not something a rollback does
-- silently. Retire the definitions first (set_workflow_definition_active_v1),
-- then run this.
--
-- Nothing else changes: no table, column, policy, index, trigger or grant, and
-- no DML. Existing instances keep their own snapshots and stay decidable.
-- ============================================================================

begin;

do $guard$
declare v_n int;
begin
  select count(*) into v_n
    from public.workflow_definitions
   where context_entity_type = 'work_task';
  if v_n > 0 then
    raise exception
      'refusing rollback: % work_task workflow definition(s) exist. Retire them first (set_workflow_definition_active_v1), then re-run.', v_n;
  end if;
end $guard$;

create or replace function public.create_workflow_definition_v1(
  p_organization_id     text,
  p_name                text,
  p_slug                text,
  p_context_entity_type text,
  p_steps               jsonb
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_org      uuid;
  v_name     text := nullif(trim(coalesce(p_name, '')), '');
  v_slug     text := lower(nullif(trim(coalesce(p_slug, '')), ''));
  v_ctx      text := nullif(trim(coalesce(p_context_entity_type, '')), '');
  actor_role text;
  v_def      uuid;
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
    v_org := nullif(trim(coalesce(p_organization_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_org is null then return 'invalid'; end if;

  -- Merged outcome for "org missing" and "no authority" — no oracle.
  actor_role := public.membership_actor_role_v1(uid, v_org);
  if actor_role is null or actor_role not in ('owner','admin') then
    return 'not_authorized';
  end if;

  if v_name is null or char_length(v_name) < 3 or char_length(v_name) > 120 then
    return 'invalid';
  end if;
  if v_slug is null or v_slug !~ '^[a-z0-9]+(_[a-z0-9]+)*$' or char_length(v_slug) > 60 or char_length(v_slug) < 2 then
    return 'invalid';
  end if;
  if v_ctx is null or v_ctx not in (
    'generic_request','worker_absence','expense','invoice','document_ack',
    'timesheet','procurement','business_trip','management_decision','agreement') then
    return 'invalid';
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

  -- Abuse cap: a template catalogue is a short list, not a data dump.
  if (select count(*) from public.workflow_definitions d
       where d.organization_id = v_org) >= 50 then
    return 'limit_reached';
  end if;

  if exists (select 1 from public.workflow_definitions d
              where d.organization_id = v_org and d.slug = v_slug) then
    return 'already_exists';
  end if;

  insert into public.workflow_definitions
    (organization_id, slug, name, context_entity_type, created_by)
  values (v_org, v_slug, v_name, v_ctx, uid)
  returning id into v_def;

  insert into public.workflow_definition_versions (definition_id, version, created_by)
  values (v_def, 1, uid)
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

  return 'created';
end;
$$;

revoke all on function public.create_workflow_definition_v1(text, text, text, text, jsonb) from public;
revoke all on function public.create_workflow_definition_v1(text, text, text, text, jsonb) from anon;
grant execute on function public.create_workflow_definition_v1(text, text, text, text, jsonb) to authenticated;

commit;
