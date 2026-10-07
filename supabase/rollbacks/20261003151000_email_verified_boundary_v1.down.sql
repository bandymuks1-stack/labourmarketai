-- ROLLBACK of 20261003151000_email_verified_boundary_v1
--
-- !! ORDER: turn Supabase Auth "Confirm email" back ON FIRST. With
-- !! autoconfirm still ON this rollback re-opens the invitation/membership
-- !! identity-takeover (anyone can register a victim's address and claim).
--
-- Restores the live pre-migration definitions of every changed function and
-- policy, reverses the in-place patches, drops the new functions. The evidence
-- tables are dropped ONLY when they hold no `mailbox_proof` row (those rows are
-- the one thing a backfill cannot recreate); otherwise they are kept.

-- 1. Reverse the in-place patches (no-ops when the marker is absent).
create or replace function pg_temp.unpatch_fn(
  p_sig regprocedure, p_pattern text, p_repl text, p_marker text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig);
  if position(p_marker in d) = 0 then return; end if;
  execute regexp_replace(d, p_pattern, p_repl, 'g');
end $$;

select pg_temp.unpatch_fn('public.assign_training_v1(text,text,text)'::regprocedure,
  'from public\.profiles p where p\.id = public\.profile_id_by_verified_email_v1\((\w+)\) limit 1',
  'from public.profiles p where lower(p.email) = lower(trim(\1)) limit 1', 'profile_id_by_verified_email_v1');
select pg_temp.unpatch_fn('public.create_management_decision_v1(text,text,text,text,text)'::regprocedure,
  'from public\.profiles p where p\.id = public\.profile_id_by_verified_email_v1\((\w+)\) limit 1',
  'from public.profiles p where lower(p.email) = lower(trim(\1)) limit 1', 'profile_id_by_verified_email_v1');
select pg_temp.unpatch_fn('public.update_management_decision_v1(text,text,text,text,text)'::regprocedure,
  'from public\.profiles p where p\.id = public\.profile_id_by_verified_email_v1\((\w+)\) limit 1',
  'from public.profiles p where lower(p.email) = lower(trim(\1)) limit 1', 'profile_id_by_verified_email_v1');
select pg_temp.unpatch_fn('public.create_performance_review_v1(text,text,text)'::regprocedure,
  'from public\.profiles p where p\.id = public\.profile_id_by_verified_email_v1\((\w+)\) limit 1',
  'from public.profiles p where lower(p.email) = lower(trim(\1)) limit 1', 'profile_id_by_verified_email_v1');
select pg_temp.unpatch_fn('public.delegate_workflow_step_v1(text,text,text)'::regprocedure,
  'from public\.profiles p where p\.id = public\.profile_id_by_verified_email_v1\((\w+)\) limit 1',
  'from public.profiles p where lower(p.email) = lower(trim(\1)) limit 1', 'profile_id_by_verified_email_v1');
select pg_temp.unpatch_fn('public.membership_invite_v1(uuid,text,text)'::regprocedure,
  'from public\.profiles where id = public\.profile_id_by_verified_email_v1\(p_email\) limit 1',
  'from public.profiles where lower(email) = lower(trim(coalesce(p_email, ''''))) limit 1', 'profile_id_by_verified_email_v1');
select pg_temp.unpatch_fn(
  'public.lmc_admin_grant_v1(text,bigint,text,text,timestamp with time zone,text)'::regprocedure,
  'public\.email_is_verified_v1\(u\.id, u\.email\)', 'u.email_confirmed_at is not null', 'email_is_verified_v1');
select pg_temp.unpatch_fn(
  'public.lmc_grant_promotional_v1(text,uuid,text,text)'::regprocedure,
  'public\.email_is_verified_v1\(u\.id, u\.email\)', 'u.email_confirmed_at is not null', 'email_is_verified_v1');

-- 2. Policies back to the live pre-migration expressions.
alter policy agency_client_connections_select on public.agency_client_connections
  using (
    owns_company(agency_company_id)
    or ((client_company_id is not null) and owns_company(client_company_id))
    or (lower(invited_email) = lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)))
    or is_admin()
  );
alter policy agency_worker_invitations_select on public.agency_worker_invitations
  using (
    owns_agency(agency_id)
    or (lower(invited_email) = lower(nullif((auth.jwt() ->> 'email'::text), ''::text)))
    or is_admin()
  );
alter policy company_worker_invitations_select on public.company_worker_invitations
  using (
    owns_company(company_id)
    or (lower(invited_email) = lower(nullif((auth.jwt() ->> 'email'::text), ''::text)))
    or is_admin()
    or invitation_company_authority_v1(company_id)
  );

-- 3. Claim functions back to their live pre-migration bodies.
create or replace function public.accept_agency_client_connection_v1(p_connection_id uuid, p_client_company_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid    uuid := auth.uid();
  v_email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_agency uuid;
  v_status text;
  v_exp    timestamptz;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if not public.owns_company(p_client_company_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  select agency_company_id, status, expires_at
    into v_agency, v_status, v_exp
    from public.agency_client_connections
   where id = p_connection_id
     and lower(invited_email) = v_email
   for update;
  if not found then return 'not_found'; end if;
  if v_agency = p_client_company_id then raise exception 'same_company' using errcode = '22023'; end if;
  if v_status = 'active' then return 'already_active'; end if;
  if v_status <> 'pending' then return 'not_pending'; end if;
  if v_exp < now() then
    update public.agency_client_connections set status = 'declined' where id = p_connection_id;
    return 'expired';
  end if;
  update public.agency_client_connections
     set status = 'active', client_company_id = p_client_company_id,
         accepted_by = v_uid, accepted_at = now()
   where id = p_connection_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'agency_client_connection_accepted', 'agency_client_connections',
          p_connection_id, jsonb_build_object('client_company_id', p_client_company_id));
  return 'accepted';
end;
$function$;

create or replace function public.decline_agency_client_connection_v1(p_connection_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_upd   int;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  update public.agency_client_connections
     set status = 'declined', revoked_by = v_uid, revoked_at = now()
   where id = p_connection_id
     and lower(invited_email) = v_email
     and status = 'pending';
  get diagnostics v_upd = row_count;
  return case when v_upd > 0 then 'declined' else 'not_found' end;
end;
$function$;

create or replace function public.accept_agency_worker_invitation(p_agency_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid      uuid := auth.uid();
  v_email  text := lower(nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_worker uuid;
  v_inv    uuid;
  v_linked boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into v_worker
  from public.workers w
  where w.profile_id = uid;
  if v_worker is null then
    return 'no_worker_profile';
  end if;
  if v_email is null then
    return 'no_invitation';
  end if;
  select i.id into v_inv
  from public.agency_worker_invitations i
  where i.agency_id = p_agency_id
    and lower(i.invited_email) = v_email
    and i.status = 'pending'
  limit 1;
  if v_inv is null then
    return 'no_invitation';
  end if;
  select exists (
    select 1 from public.agency_workers aw
    where aw.agency_id = p_agency_id and aw.worker_id = v_worker
  ) into v_linked;
  if v_linked then
    update public.agency_worker_invitations
       set status = 'accepted', accepted_at = now()
     where id = v_inv;
    return 'already_linked';
  end if;
  insert into public.agency_workers (agency_id, worker_id, status)
  values (p_agency_id, v_worker, 'active')
  on conflict (agency_id, worker_id) do nothing;
  update public.agency_worker_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv;
  insert into public.audit_logs (actor_id, action, entity, payload)
  values (uid, 'accept_agency_worker_invitation', 'agency_workers',
    jsonb_build_object(
      'agency_id', p_agency_id, 'worker_id', v_worker,
      'invitation_id', v_inv, 'result', 'linked'));
  return 'linked';
end $function$;

create or replace function public.accept_company_worker_invitation(p_company_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid      uuid := auth.uid();
  v_email  text := lower(nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_worker uuid;
  v_inv    uuid;
  v_linked boolean;
  v_org    uuid;
  v_ctx    uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into v_worker
  from public.workers w
  where w.profile_id = uid;
  if v_worker is null then
    return 'no_worker_profile';
  end if;
  if v_email is null then
    return 'no_invitation';
  end if;
  select i.id into v_inv
  from public.company_worker_invitations i
  where i.company_id = p_company_id
    and lower(i.invited_email) = v_email
    and i.status = 'pending'
  limit 1;
  if v_inv is null then
    return 'no_invitation';
  end if;
  select exists (
    select 1 from public.company_workers cw
    where cw.company_id = p_company_id and cw.worker_id = v_worker
  ) into v_linked;
  if not v_linked then
    insert into public.company_workers (company_id, worker_id, status)
    values (p_company_id, v_worker, 'active')
    on conflict (company_id, worker_id) do nothing;
  end if;
  update public.company_worker_invitations
     set status = 'accepted', accepted_at = now()
   where id = v_inv;
  select o.id into v_org
  from public.organizations o
  where o.legacy_company_id = p_company_id
  limit 1;
  if v_org is not null then
    select ec.id into v_ctx
    from public.engagement_contexts ec
    where ec.profile_id = uid
      and ec.organization_id = v_org
      and ec.relationship_slug = 'employee'
      and ec.status = 'active'
    limit 1;
    if v_ctx is null then
      insert into public.engagement_contexts
        (profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
      values
        (uid, v_org, 'employee', 'active', false,
         encode(extensions.digest(uid::text || ':employee:' || v_org::text, 'sha256'), 'hex'))
      returning id into v_ctx;
      insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
      values (uid, 'accept_company_worker_invitation', 'engagement_contexts', v_ctx,
        jsonb_build_object('organization_id', v_org, 'worker_id', v_worker,
          'company_id', p_company_id, 'relationship_slug', 'employee',
          'result', 'org_bound'));
    end if;
  end if;
  if v_linked then
    return 'already_linked';
  end if;
  insert into public.audit_logs (actor_id, action, entity, payload)
  values (uid, 'accept_company_worker_invitation', 'company_workers',
    jsonb_build_object(
      'company_id', p_company_id, 'worker_id', v_worker,
      'invitation_id', v_inv, 'result', 'linked'));
  return 'linked';
end $function$;

create or replace function public.accept_invitation_by_id_v2(p_invitation_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invited text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select lower(invited_email) into v_invited from public.invitations
   where id = p_invitation_id;
  if not found or v_invited is null or v_email = '' or v_invited <> v_email then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  return public.accept_invitation_apply_v2(p_invitation_id, uid);
end $function$;

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
  select * into v_token_row from public.invitations
   where id = p_invitation_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
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

create or replace function public.list_invitations_for_me_v1()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_items jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_email = '' then
    return jsonb_build_object('items', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(item order by item ->> 'created_at' desc), '[]'::jsonb)
    into v_items
    from (
      select jsonb_build_object(
        'id', i.id,
        'invitation_type', i.invitation_type,
        'personal_message', i.personal_message,
        'proposed_role', i.proposed_role,
        'created_at', i.created_at,
        'expires_at', i.expires_at,
        'relationship_slug', i.relationship_slug,
        'organization_name', (select coalesce(o.display_name, o.legal_name)
                                from public.organizations o
                               where o.id = i.organization_id),
        'project_title', (select p.title from public.projects p
                           where p.id = i.project_id),
        'inviter_name', (select pr.full_name from public.profiles pr
                          where pr.id = i.inviter_profile_id)
      ) as item
      from public.invitations i
      where lower(i.invited_email) = v_email
        and i.status = 'pending'
        and i.expires_at > now()
      order by i.created_at desc
      limit 50
    ) sub;
  return jsonb_build_object('items', v_items);
end $function$;

-- 4. Drop the new surface.
drop function if exists public.confirm_my_email_v1();
drop function if exists public.request_email_verification_v1();
drop function if exists public.my_email_verification_v1();
drop function if exists public.backfill_verified_emails_v1();
drop function if exists public.profile_id_by_verified_email_v1(text);
drop function if exists public.session_email_verified_v1();
drop function if exists public.email_is_verified_v1(uuid, text);

-- 5. Evidence tables: dropped only when they hold no proof row a backfill
--    cannot recreate (mailbox_proof). Backfilled rows are recomputable.
do $$
begin
  if to_regclass('public.email_verifications_v1') is null then
    null; -- nothing to drop (rollback re-run)
  elsif (select count(*) from public.email_verifications_v1 where method = 'mailbox_proof') > 0 then
    raise notice 'email_verifications_v1 kept: it holds mailbox_proof rows';
  else
    drop table if exists public.email_verification_requests_v1;
    drop table if exists public.email_verifications_v1;
    drop table if exists public.email_verification_policy_v1;
  end if;
end $$;
