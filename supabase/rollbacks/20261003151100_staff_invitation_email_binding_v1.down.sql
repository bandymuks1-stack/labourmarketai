-- ============================================================================
-- ROLLBACK of 20261003151100_staff_invitation_email_binding_v1
--
-- Restores the six function bodies to their LIVE production definitions as of
-- 2026-10-04 (pg_get_functiondef of project gorgitwvdzxbnaxhrsrw, read-only
-- SELECT) and drops the two internal helpers the migration added. No table,
-- column, policy or grant is touched in either direction, and no data is
-- rewritten: an invitation consumed or declined while the migration was live
-- keeps that state.
-- ============================================================================

create or replace function public.accept_invitation_apply_v2(p_invitation_id uuid, p_actor uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := p_actor;
  v_row public.invitations%rowtype;
  v_worker uuid;
  v_existing uuid;
  v_new uuid;
  v_slug text;
  v_relationship text := 'none';
  v_prior public.invitation_acceptances%rowtype;
  v_uses int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.invitations
   where id = p_invitation_id
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- The SAME person answering the SAME invitation twice is idempotent —
  -- they get their earlier answer back, and nothing is written.
  select * into v_prior from public.invitation_acceptances
   where invitation_id = v_row.id and profile_id = uid;
  if found and v_prior.decision = 'accepted' then
    return jsonb_build_object('outcome', 'already_accepted',
      'relationship', v_prior.relationship, 'relationship_id', v_prior.relationship_id,
      'invitation_type', v_row.invitation_type,
      'organization_id', v_row.organization_id, 'project_id', v_row.project_id,
      'target_request_id', v_row.target_request_id,
      'external_source_slug', v_row.external_source_slug);
  end if;

  if v_row.status = 'accepted' then
    -- Single-use: taken. Multi-use: every seat is taken.
    return jsonb_build_object('outcome',
      case when v_row.max_uses > 1 then 'exhausted' else 'already_accepted' end);
  end if;
  if v_row.status in ('revoked','declined','expired') then
    return jsonb_build_object('outcome', v_row.status);
  end if;
  if v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    return jsonb_build_object('outcome', 'expired');
  end if;

  -- Canonical relationship per invitation (v1 arms, unchanged).
  if v_row.invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner') then
    v_slug := coalesce(
      nullif(v_row.relationship_slug, ''),
      case when v_row.invitation_type = 'collaborate_partner'
           then 'collaborator' else 'employee' end);
    select id into v_existing from public.engagement_contexts
     where profile_id = uid and organization_id = v_row.organization_id
       and relationship_slug = v_slug and status = 'active' limit 1;
    if v_existing is null then
      insert into public.engagement_contexts
        (profile_id, organization_id, relationship_slug, status, is_primary,
         title, hash_self)
      values
        (uid, v_row.organization_id, v_slug, 'active', false,
         v_row.proposed_role,
         encode(extensions.digest(uid::text || ':' || v_slug || ':' || v_row.organization_id::text, 'sha256'), 'hex'))
      returning id into v_new;
      v_relationship = 'engagement_created';
    else
      v_new := v_existing;
      v_relationship = 'engagement_existing';
    end if;
  elsif v_row.invitation_type = 'join_project' then
    select id into v_worker from public.workers where profile_id = uid limit 1;
    if v_worker is null then
      return jsonb_build_object('outcome', 'no_worker_profile');
    end if;
    select id into v_existing from public.project_worker_assignments
     where project_id = v_row.project_id and worker_id = v_worker limit 1;
    if v_existing is null then
      insert into public.project_worker_assignments (project_id, worker_id, status)
      values (v_row.project_id, v_worker, 'active')
      returning id into v_new;
      v_relationship = 'assignment_created';
    else
      update public.project_worker_assignments
         set status = 'active', ended_at = null
       where id = v_existing;
      v_new := v_existing;
      v_relationship = 'assignment_reactivated';
    end if;
  elsif v_row.invitation_type = 'invite_to_demand' then
    -- EMPLOYER_INVITED_TO_TARGET, never SYSTEM_MATCHED_TO_TARGET. The
    -- interest row is the same row a worker's own click writes, so the
    -- employer's scouting view lists the person exactly once — but its
    -- snapshot carries NO status_band and names its basis, so no surface
    -- can read a match the engine never computed.
    select id into v_worker from public.workers where profile_id = uid limit 1;
    if v_worker is null then
      return jsonb_build_object('outcome', 'no_worker_profile');
    end if;
    select id into v_existing from public.demand_interest_signals
     where request_id = v_row.target_request_id and worker_id = v_worker limit 1;
    if v_existing is null then
      insert into public.demand_interest_signals
        (request_id, worker_id, status, match_snapshot)
      values
        (v_row.target_request_id, v_worker, 'interested',
         jsonb_build_object('basis', 'employer_invitation',
                            'invitation_id', v_row.id,
                            'invited_at', v_row.created_at,
                            'need_source', 'customer_requests'))
      returning id into v_new;
      v_relationship = 'interest_recorded';
    else
      v_new := v_existing;
      v_relationship = 'interest_existing';
    end if;
  end if;

  -- The ledger row: who accepted what, when, and what it created.
  insert into public.invitation_acceptances
    (invitation_id, profile_id, decision, relationship, relationship_id)
  values (v_row.id, uid, 'accepted', v_relationship, v_new)
  on conflict (invitation_id, profile_id) do update
    set decision = 'accepted', relationship = excluded.relationship,
        relationship_id = excluded.relationship_id, decided_at = now();

  -- The seat count. The invitation closes when its last seat is taken; a
  -- single-use invitation therefore closes on its first acceptance — exactly
  -- the v1 behaviour, now expressed as max_uses = 1.
  v_uses := v_row.use_count + 1;
  update public.invitations
     set use_count = v_uses,
         status = case when v_uses >= max_uses then 'accepted' else status end,
         accepted_at = case when v_uses >= max_uses then now() else accepted_at end,
         accepted_by_profile_id = case when max_uses = 1 then uid else accepted_by_profile_id end
   where id = v_row.id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'accept_invitation_v2', 'invitations', v_row.id,
    jsonb_build_object('invitation_type', v_row.invitation_type,
      'relationship', v_relationship, 'relationship_id', v_new,
      'relationship_slug', v_slug, 'use_count', v_uses, 'max_uses', v_row.max_uses,
      'organization_id', v_row.organization_id, 'project_id', v_row.project_id,
      'target_request_id', v_row.target_request_id,
      'external_source_slug', v_row.external_source_slug));

  return jsonb_build_object(
    'outcome', 'accepted',
    'relationship', v_relationship,
    'relationship_id', v_new,
    'relationship_slug', v_slug,
    'invitation_type', v_row.invitation_type,
    'invitation_id', v_row.id,
    'inviter_profile_id', v_row.inviter_profile_id,
    'organization_id', v_row.organization_id,
    'project_id', v_row.project_id,
    'target_request_id', v_row.target_request_id,
    'external_source_slug', v_row.external_source_slug,
    'has_declared_context', v_row.declared_context is not null
  );
end $function$;

create or replace function public.accept_invitation_v1(p_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_row public.invitations%rowtype;
  v_worker uuid;
  v_existing uuid;
  v_new uuid;
  v_slug text;
  v_relationship text := 'none';
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if v_row.status = 'accepted' then
    return jsonb_build_object('outcome', 'already_accepted');
  end if;
  if v_row.status in ('revoked','declined') then
    return jsonb_build_object('outcome', v_row.status);
  end if;
  if v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    return jsonb_build_object('outcome', 'expired');
  end if;

  -- Canonical relationship per invitation.
  if v_row.invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner') then
    -- The relationship the INVITER named, when they named one. The CASE below
    -- is the pre-20260827200000 behaviour and remains the answer for every
    -- invitation that carries no slug — which is every invitation that existed
    -- before this migration.
    v_slug := coalesce(
      nullif(v_row.relationship_slug, ''),
      case when v_row.invitation_type = 'collaborate_partner'
           then 'collaborator' else 'employee' end);
    select id into v_existing from public.engagement_contexts
     where profile_id = uid and organization_id = v_row.organization_id
       and relationship_slug = v_slug and status = 'active' limit 1;
    if v_existing is null then
      insert into public.engagement_contexts
        (profile_id, organization_id, relationship_slug, status, is_primary,
         title, hash_self)
      values
        (uid, v_row.organization_id, v_slug, 'active', false,
         v_row.proposed_role,
         encode(extensions.digest(uid::text || ':' || v_slug || ':' || v_row.organization_id::text, 'sha256'), 'hex'))
      returning id into v_new;
      v_relationship = 'engagement_created';
    else
      v_new := v_existing;
      v_relationship = 'engagement_existing';
    end if;
  elsif v_row.invitation_type = 'join_project' then
    select id into v_worker from public.workers where profile_id = uid limit 1;
    if v_worker is null then
      -- Not consumed: the person can create a worker profile and accept.
      return jsonb_build_object('outcome', 'no_worker_profile');
    end if;
    select id into v_existing from public.project_worker_assignments
     where project_id = v_row.project_id and worker_id = v_worker limit 1;
    if v_existing is null then
      insert into public.project_worker_assignments (project_id, worker_id, status)
      values (v_row.project_id, v_worker, 'active')
      returning id into v_new;
      v_relationship = 'assignment_created';
    else
      update public.project_worker_assignments
         set status = 'active', ended_at = null
       where id = v_existing;
      v_new := v_existing;
      v_relationship = 'assignment_reactivated';
    end if;
  end if;

  update public.invitations
     set status = 'accepted',
         accepted_at = now(),
         accepted_by_profile_id = uid
   where id = v_row.id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'accept_invitation_v1', 'invitations', v_row.id,
    jsonb_build_object('invitation_type', v_row.invitation_type,
      'relationship', v_relationship, 'relationship_id', v_new,
      'relationship_slug', v_slug,
      'organization_id', v_row.organization_id, 'project_id', v_row.project_id));

  return jsonb_build_object(
    'outcome', 'accepted',
    'relationship', v_relationship,
    'relationship_slug', v_slug,
    'invitation_type', v_row.invitation_type,
    'organization_id', v_row.organization_id,
    'project_id', v_row.project_id
  );
end $function$;

create or replace function public.decline_invitation_v1(p_token text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_row public.invitations%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;
  if not found then return 'not_found'; end if;
  if v_row.status <> 'pending' then return v_row.status; end if;

  update public.invitations
     set status = 'declined', declined_at = now()
   where id = v_row.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'decline_invitation_v1', 'invitations', v_row.id,
    jsonb_build_object('result', 'declined'));
  return 'declined';
end $function$;

create or replace function public.decline_invitation_v2(p_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_row public.invitations%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if exists (select 1 from public.invitation_acceptances
              where invitation_id = v_row.id and profile_id = uid
                and decision = 'accepted') then
    return jsonb_build_object('outcome', 'already_accepted');
  end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('outcome', v_row.status);
  end if;
  if v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    return jsonb_build_object('outcome', 'expired');
  end if;

  insert into public.invitation_acceptances (invitation_id, profile_id, decision)
  values (v_row.id, uid, 'declined')
  on conflict (invitation_id, profile_id) do update
    set decision = 'declined', decided_at = now();

  if v_row.max_uses = 1 then
    update public.invitations
       set status = 'declined', declined_at = now()
     where id = v_row.id;
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'decline_invitation_v2', 'invitations', v_row.id,
    jsonb_build_object('invitation_type', v_row.invitation_type,
      'max_uses', v_row.max_uses));

  return jsonb_build_object('outcome', 'declined',
    'invitation_type', v_row.invitation_type);
end $function$;

create or replace function public.get_invitation_preview_v1(p_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_row public.invitations%rowtype;
  v_org_name text;
  v_project_title text;
  v_inviter_name text;
  v_status text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  v_status := case
    when v_row.status = 'pending' and v_row.expires_at <= now() then 'expired'
    else v_row.status
  end;

  select coalesce(display_name, legal_name) into v_org_name
    from public.organizations where id = v_row.organization_id;
  select title into v_project_title
    from public.projects where id = v_row.project_id;
  select coalesce(full_name, 'LabourMarket.ai') into v_inviter_name
    from public.profiles where id = v_row.inviter_profile_id;

  return jsonb_build_object(
    'outcome', 'ok',
    'invitation_type', v_row.invitation_type,
    'status', v_status,
    'invited_email', v_row.invited_email,
    'invited_name', v_row.invited_name,
    'proposed_role', v_row.proposed_role,
    'personal_message', v_row.personal_message,
    'expires_at', v_row.expires_at,
    'organization_name', v_org_name,
    'project_title', v_project_title,
    'inviter_name', v_inviter_name,
    -- NEW 20260827200000. NULL for every pre-existing invitation.
    'relationship_slug', v_row.relationship_slug
  );
end $function$;

create or replace function public.get_invitation_preview_v2(p_token text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_row public.invitations%rowtype;
  v_org_name text;
  v_project_title text;
  v_inviter_name text;
  v_status text;
  v_demand_role text;
  v_demand_country text;
  v_demand_org uuid;
  v_my_decision text;
  v_my_review jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  v_status := case
    when v_row.status = 'pending' and v_row.expires_at <= now() then 'expired'
    else v_row.status
  end;

  select coalesce(display_name, legal_name) into v_org_name
    from public.organizations where id = v_row.organization_id;
  select title into v_project_title
    from public.projects where id = v_row.project_id;
  select coalesce(full_name, 'LabourMarket.ai') into v_inviter_name
    from public.profiles where id = v_row.inviter_profile_id;
  if v_row.target_request_id is not null then
    -- CORRECTED: the table's column is role_or_work_type (role_text is the
    -- worker-board RPC's projection name and does not exist here).
    select role_or_work_type, country, organization_id
      into v_demand_role, v_demand_country, v_demand_org
      from public.customer_requests where id = v_row.target_request_id;
    if v_org_name is null and v_demand_org is not null then
      select coalesce(display_name, legal_name) into v_org_name
        from public.organizations where id = v_demand_org;
    end if;
  end if;
  select decision, context_review into v_my_decision, v_my_review
    from public.invitation_acceptances
   where invitation_id = v_row.id and profile_id = uid;

  return jsonb_build_object(
    'outcome', 'ok',
    'invitation_id', v_row.id,
    'invitation_type', v_row.invitation_type,
    'status', v_status,
    'invited_email', v_row.invited_email,
    'invited_name', v_row.invited_name,
    'proposed_role', v_row.proposed_role,
    'personal_message', v_row.personal_message,
    'expires_at', v_row.expires_at,
    'organization_name', v_org_name,
    'project_title', v_project_title,
    'inviter_name', case when v_row.inviter_profile_id is null then null else v_inviter_name end,
    'relationship_slug', v_row.relationship_slug,
    'max_uses', v_row.max_uses,
    'use_count', v_row.use_count,
    'campaign_label', v_row.campaign_label,
    'demand_role_text', v_demand_role,
    'demand_country', v_demand_country,
    'external_source_slug', v_row.external_source_slug,
    'my_decision', v_my_decision,
    'has_declared_context', v_row.declared_context is not null,
    'declared_context', case when v_my_decision = 'accepted' then v_row.declared_context else null end,
    'context_review', case when v_my_decision = 'accepted' then coalesce(v_my_review, '{}'::jsonb) else null end
  );
end $function$;

drop function if exists public.invitation_session_email_matches_v1(text);
drop function if exists public.invitation_mask_email_v1(text);
