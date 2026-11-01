-- ============================================================================
-- ROLLBACK of 20261021094000_invitations_follow_org_authority_v1
--
-- Restores the five previous bodies VERBATIM with their privilege state:
--   disband_team_v1             <- 20261014190000_team_disband_v1 (only where it exists)
--   accept_invitation_apply_v2  <- 20261003151100_staff_invitation_email_binding_v1
--   accept_invitation_v1        <- 20261003151100_staff_invitation_email_binding_v1
--   accept_invitation_by_id_v1  <- 20261003151000_email_verified_boundary_v1
--   resend_invitation_v1        <- 20260817121000_invitation_org_authority_v1
--
-- DATA IS NOT TOUCHED. Invitations closed as 'revoked' while the migration was
-- live stay revoked (re-opening a dead link into an archived organization is
-- a new decision, not an undo). No ACL is widened: the v1 doors keep whatever
-- EXECUTE state is live.
-- ============================================================================

begin;

do $disband$
begin
  if to_regprocedure('public.disband_team_v1(uuid)') is not null then
    execute $ddl$
create or replace function public.disband_team_v1(p_team_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid       uuid := auth.uid();
  v_team    public.organizations%rowtype;
  v_ec      record;
  v_out     text;
  v_members int := 0;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_team
    from public.organizations o
   where o.id = p_team_id
     and o.owner_profile_id = uid
     and o.organization_type = 'team';
  if not found then
    return 'not_found';
  end if;
  if v_team.archived_at is not null then
    return 'already_disbanded';
  end if;

  if exists (select 1 from public.team_assignments a
              where a.team_org_id = p_team_id and a.status = 'active')
     or exists (select 1 from public.team_demand_offers d
                 where d.team_org_id = p_team_id and d.status in ('offered', 'accepted'))
     or exists (select 1 from public.team_enquiries e
                 where e.team_org_id = p_team_id and e.status = 'created') then
    return 'has_open_work';
  end if;

  begin
    for v_ec in
      select ec.id
        from public.engagement_contexts ec
       where ec.organization_id = p_team_id
         and ec.status = 'active'
         -- The owner's own 'owner' engagement stays: end_org_membership_v1
         -- refuses the last owner by design, and an archived organization is
         -- already left out of every workspace read with its memberships kept
         -- as history (lib/company/archived-organizations.ts) — the same
         -- treatment the 2026-09-23 org consolidation gave archived orgs.
         and ec.profile_id is distinct from v_team.owner_profile_id
       order by ec.created_at
    loop
      v_out := public.end_engagement_lifecycle_v1(v_ec.id::text, 'other', 'team_disbanded');
      if v_out not in ('ended', 'already_ended') then
        raise exception 'member_end_failed:%', v_out using errcode = 'P0001';
      end if;
      v_members := v_members + 1;
    end loop;

    update public.organizations
       set archived_at = now(),
           archived_reason = 'team_disbanded'
     where id = p_team_id
       and archived_at is null;

    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'disband_team_v1', 'organizations', p_team_id,
      jsonb_build_object(
        'organization_type', 'team',
        'members_ended', v_members,
        'result', 'disbanded'));
  exception when sqlstate 'P0001' then
    -- Subtransaction rolled back: every membership ended above is restored.
    return 'member_end_failed';
  end;

  return 'disbanded';
end $function$;
    $ddl$;
    execute 'revoke all on function public.disband_team_v1(uuid) from public';
    execute 'revoke all on function public.disband_team_v1(uuid) from anon';
    execute 'grant execute on function public.disband_team_v1(uuid) to authenticated';
  end if;
end $disband$;

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
  -- ADDRESSED INVITATION: the caller's session e-mail must be the invited one.
  -- Checked BEFORE the idempotency, status and expiry branches so that a
  -- stranger holding a forwarded link changes NOTHING (no expiry stamp, no
  -- ledger row, no seat, no relationship) and learns nothing but the refusal.
  -- Invitations with no invited_email (shareable / campaign links) pass.
  if not public.invitation_session_email_matches_v1(v_row.invited_email) then
    return jsonb_build_object('outcome', 'email_mismatch');
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

revoke all on function public.accept_invitation_apply_v2(uuid, uuid) from public, anon, authenticated;

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
  -- ADDRESSED INVITATION: see accept_invitation_apply_v2.
  if not public.invitation_session_email_matches_v1(v_row.invited_email) then
    return jsonb_build_object('outcome', 'email_mismatch');
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

revoke all on function public.accept_invitation_v1(text) from public;
revoke all on function public.accept_invitation_v1(text) from anon;

create or replace function public.accept_invitation_by_id_v1(p_invitation_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_token_row public.invitations%rowtype;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.session_email_verified_v1() then
    return jsonb_build_object('outcome', 'email_unverified');
  end if;
  select * into v_token_row from public.invitations
   where id = p_invitation_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  -- The in-app path exists ONLY for invitations addressed to the caller's
  -- own VERIFIED email — never a way to probe or consume someone else's.
  if v_email = '' or lower(v_token_row.invited_email) <> v_email then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_token_row.status = 'accepted' then
    return jsonb_build_object('outcome', 'already_accepted');
  end if;
  if v_token_row.status in ('revoked','declined') then
    return jsonb_build_object('outcome', v_token_row.status);
  end if;
  if v_token_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_token_row.id;
    return jsonb_build_object('outcome', 'expired');
  end if;

  declare
    v_worker uuid;
    v_existing uuid;
    v_new uuid;
    v_slug text;
    v_relationship text := 'none';
  begin
    if v_token_row.invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner') then
      v_slug := coalesce(
        nullif(v_token_row.relationship_slug, ''),
        case when v_token_row.invitation_type = 'collaborate_partner'
             then 'collaborator' else 'employee' end);
      select id into v_existing from public.engagement_contexts
       where profile_id = uid and organization_id = v_token_row.organization_id
         and relationship_slug = v_slug and status = 'active' limit 1;
      if v_existing is null then
        insert into public.engagement_contexts
          (profile_id, organization_id, relationship_slug, status, is_primary,
           title, hash_self)
        values
          (uid, v_token_row.organization_id, v_slug, 'active', false,
           v_token_row.proposed_role,
           encode(extensions.digest(uid::text || ':' || v_slug || ':' || v_token_row.organization_id::text, 'sha256'), 'hex'))
        returning id into v_new;
        v_relationship = 'engagement_created';
      else
        v_new := v_existing;
        v_relationship = 'engagement_existing';
      end if;
    elsif v_token_row.invitation_type = 'join_project' then
      select id into v_worker from public.workers where profile_id = uid limit 1;
      if v_worker is null then
        return jsonb_build_object('outcome', 'no_worker_profile');
      end if;
      select id into v_existing from public.project_worker_assignments
       where project_id = v_token_row.project_id and worker_id = v_worker limit 1;
      if v_existing is null then
        insert into public.project_worker_assignments (project_id, worker_id, status)
        values (v_token_row.project_id, v_worker, 'active')
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
     where id = v_token_row.id;

    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'accept_invitation_by_id_v1', 'invitations', v_token_row.id,
      jsonb_build_object('invitation_type', v_token_row.invitation_type,
        'relationship', v_relationship, 'relationship_id', v_new,
        'relationship_slug', v_slug));

    return jsonb_build_object(
      'outcome', 'accepted',
      'relationship', v_relationship,
      'relationship_slug', v_slug,
      'invitation_type', v_token_row.invitation_type,
      'organization_id', v_token_row.organization_id,
      'project_id', v_token_row.project_id
    );
  end;
end $function$;

revoke all on function public.accept_invitation_by_id_v1(uuid) from public;
revoke all on function public.accept_invitation_by_id_v1(uuid) from anon;

create or replace function public.resend_invitation_v1(p_invitation_id uuid, p_new_token_hash text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  v_inviter uuid;
  v_status  text;
  v_resends int;
  v_org     uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_new_token_hash is null or p_new_token_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid_token_hash';
  end if;
  select inviter_profile_id, status, resend_count, organization_id
    into v_inviter, v_status, v_resends, v_org
    from public.invitations where id = p_invitation_id;
  if not found then return 'not_found'; end if;
  if v_inviter is distinct from uid
     and not public.invitation_org_authority_v1(v_org) then
    return 'not_authorized';
  end if;
  if v_status <> 'pending' then return 'not_pending'; end if;
  if v_resends >= 10 then return 'resend_limit'; end if;

  update public.invitations
     set token_hash = p_new_token_hash,
         expires_at = now() + interval '14 days',
         last_sent_at = null,
         delivery_status = 'not_sent',
         resend_count = resend_count + 1
   where id = p_invitation_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'resend_invitation_v1', 'invitations', p_invitation_id,
    jsonb_build_object('result', 'token_rotated', 'resend_count', v_resends + 1));
  return 'ok';
end $$;

revoke all on function public.resend_invitation_v1(uuid, text) from public;
revoke all on function public.resend_invitation_v1(uuid, text) from anon;
grant execute on function public.resend_invitation_v1(uuid, text) to authenticated;

-- review of #2607: restore invitation_org_authority_v1 exactly as before
create or replace function public.invitation_org_authority_v1(p_organization_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p_organization_id is not null and (
    exists (
      select 1 from public.organizations o
       where o.id = p_organization_id
         and o.owner_profile_id = auth.uid()
    )
    or exists (
      select 1 from public.company_memberships m
       where m.organization_id = p_organization_id
         and m.profile_id = auth.uid()
         and m.status = 'active'
         and (m.role in ('owner', 'admin') or m.manages_invitations)
    )
  )
$function$;

commit;
