-- @human-gate-approved
-- ─────────────────────────────────────────────────────────────────────────────
-- NULL-SAFE OWNER GUARDS v2 — RED (SECURITY DEFINER replace).
--
-- Closes a dormant authorization-bypass class in six SECURITY DEFINER
-- functions. Each authorizes with a disjunct of the shape
--   if not (public.is_admin() or v_owner = uid or public.manages_organization(...)) then <deny>
-- where `v_owner` comes from `organizations.owner_profile_id`, which is
-- NULLABLE. When the owner is NULL and the other disjuncts are false, the
-- expression is `not (false or NULL or false)` = NULL; plpgsql treats
-- `IF NULL THEN` as false, so the deny branch is SKIPPED and execution falls
-- through to the privileged effect.
--
-- The precondition is reachable through an ordinary lifecycle event, NOT an
-- exotic one: `organizations.owner_profile_id` has
--   FOREIGN KEY ... REFERENCES profiles(id) ON DELETE SET NULL
-- and `profiles.id REFERENCES auth.users(id) ON DELETE CASCADE`, so deleting
-- any owner's auth account (dashboard delete, GDPR erasure) silently NULLs
-- `owner_profile_id` on every org they owned. From that moment any
-- AUTHENTICATED user can, via `grant_org_manager`, make themselves a manager
-- of that org (persistent takeover). Anonymous callers are NOT affected — all
-- six revoke EXECUTE from PUBLIC and hard-fail on `auth.uid() is null`.
--
-- Prod at write time: 13 orgs, 0 NULL-owner, 0 team orgs — so the bypass is
-- dormant today, but one owner-account deletion arms it.
--
-- THE FIX: wrap only the NULL-source comparison in each function so a NULL
-- owner can never satisfy the owner disjunct:
--   v_owner = uid   →   (v_owner is not null and v_owner = uid)
-- `is_admin()` and `manages_organization()` are `exists(...)` and can never
-- return NULL, so they are untouched. No signature, ACL, table, column, policy
-- or DML change — CREATE OR REPLACE preserves grants. Every other line of each
-- body is byte-identical to the live catalog definition (pg_get_functiondef,
-- 2026-08-24). Rollback restores the six pre-fix bodies verbatim.
--
-- NOTE (owner decision, not in this migration): the durable root-cause fix is
-- changing the FK to ON DELETE RESTRICT (or a re-owner trigger) so the NULL
-- can never appear. That changes account-deletion behaviour and is a separate
-- RED decision; these function guards make the bypass impossible regardless.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.grant_org_manager(p_org_id uuid, p_profile_id uuid, p_operations_role text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid(); v_owner uuid; v_existing uuid; v_new uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_operations_role is not null and p_operations_role not in ('foreman','project_manager','site_manager','hr','company_admin') then return 'invalid_operations_role'; end if;
  select owner_profile_id into v_owner from public.organizations where id = p_org_id;
  if not found then return 'org_not_found'; end if;
  if not (public.is_admin() or (v_owner is not null and v_owner = uid)) then return 'not_owner'; end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then return 'profile_not_found'; end if;
  select id into v_existing from public.engagement_contexts
   where profile_id = p_profile_id and organization_id = p_org_id and relationship_slug = 'manager' and status = 'active' limit 1;
  if v_existing is not null then
    update public.engagement_contexts set operations_role = coalesce(p_operations_role, operations_role), updated_at = now() where id = v_existing;
    return 'already_manager';
  end if;
  insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, status, is_primary, operations_role, hash_self)
  values (p_profile_id, p_org_id, 'manager', 'active', false, p_operations_role,
     encode(extensions.digest(p_profile_id::text || ':manager:' || p_org_id::text, 'sha256'), 'hex'))
  returning id into v_new;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'grant_org_manager', 'engagement_contexts', v_new,
    jsonb_build_object('organization_id', p_org_id, 'profile_id', p_profile_id, 'relationship_slug', 'manager', 'operations_role', p_operations_role, 'result', 'granted'));
  return 'granted';
end $function$;

CREATE OR REPLACE FUNCTION public.add_org_member(p_org_id uuid, p_worker_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid(); v_profile uuid; v_owner uuid; v_existing uuid; v_new uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select owner_profile_id into v_owner from public.organizations where id = p_org_id;
  if not found then return 'org_not_found'; end if;
  if not (public.is_admin() or (v_owner is not null and v_owner = uid) or public.manages_organization(p_org_id)) then return 'not_authorized'; end if;
  select profile_id into v_profile from public.workers where id = p_worker_id;
  if v_profile is null then return 'worker_not_found'; end if;
  select id into v_existing from public.engagement_contexts
   where profile_id = v_profile and organization_id = p_org_id and relationship_slug = 'employee' and status = 'active' limit 1;
  if v_existing is not null then return 'already_member'; end if;
  insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
  values (v_profile, p_org_id, 'employee', 'active', false,
     encode(extensions.digest(v_profile::text || ':employee:' || p_org_id::text, 'sha256'), 'hex'))
  returning id into v_new;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'add_org_member', 'engagement_contexts', v_new,
    jsonb_build_object('organization_id', p_org_id, 'worker_id', p_worker_id, 'profile_id', v_profile, 'relationship_slug', 'employee', 'result', 'added'));
  return 'added';
end $function$;

CREATE OR REPLACE FUNCTION public.create_invitation_v1(p_token_hash text, p_invitation_type text, p_invited_email text, p_invited_name text DEFAULT NULL::text, p_organization_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_proposed_role text DEFAULT NULL::text, p_personal_message text DEFAULT NULL::text, p_locale text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid           uuid := auth.uid();
  v_email       text := lower(nullif(trim(coalesce(p_invited_email, '')), ''));
  v_org_owner   uuid;
  v_open_count  int;
  v_day_count   int;
  v_new         uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('outcome', 'invalid_token_hash');
  end if;
  if p_invitation_type not in ('join_platform','join_organization','join_team',
      'join_as_employee','collaborate_partner','join_project','invite_company') then
    return jsonb_build_object('outcome', 'invalid_type');
  end if;
  if v_email is null
     or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(v_email) > 254 then
    return jsonb_build_object('outcome', 'invalid_email');
  end if;

  if p_invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner') then
    if p_organization_id is null then
      return jsonb_build_object('outcome', 'organization_required');
    end if;
    select owner_profile_id into v_org_owner
      from public.organizations where id = p_organization_id;
    if not found then
      return jsonb_build_object('outcome', 'organization_not_found');
    end if;
    if not (public.is_admin() or (v_org_owner is not null and v_org_owner = uid)
            or public.manages_organization(p_organization_id)) then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
  elsif p_invitation_type = 'join_project' then
    if p_project_id is null then
      return jsonb_build_object('outcome', 'project_required');
    end if;
    if not exists (select 1 from public.projects where id = p_project_id) then
      return jsonb_build_object('outcome', 'project_not_found');
    end if;
    if not public.can_manage_project(p_project_id) then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
  end if;

  select count(*) into v_open_count from public.invitations
   where inviter_profile_id = uid and status = 'pending';
  if v_open_count >= 100 then
    return jsonb_build_object('outcome', 'limit_reached');
  end if;
  select count(*) into v_day_count from public.invitations
   where inviter_profile_id = uid and created_at > now() - interval '24 hours';
  if v_day_count >= 30 then
    return jsonb_build_object('outcome', 'rate_limited');
  end if;

  if exists (
    select 1 from public.invitations
     where inviter_profile_id = uid
       and lower(invited_email) = v_email
       and invitation_type = p_invitation_type
       and coalesce(organization_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_organization_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(project_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_project_id, '00000000-0000-0000-0000-000000000000')
       and status = 'pending'
       and expires_at > now()
  ) then
    return jsonb_build_object('outcome', 'duplicate_pending');
  end if;

  insert into public.invitations (
    token_hash, invitation_type, organization_id, project_id,
    invited_email, invited_name, proposed_role, personal_message,
    locale, inviter_profile_id
  ) values (
    p_token_hash, p_invitation_type,
    case when p_invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner')
         then p_organization_id else null end,
    case when p_invitation_type = 'join_project' then p_project_id else null end,
    v_email,
    nullif(trim(coalesce(p_invited_name, '')), ''),
    nullif(trim(coalesce(p_proposed_role, '')), ''),
    nullif(trim(coalesce(p_personal_message, '')), ''),
    case when p_locale ~ '^[a-z]{2}$' then p_locale else null end,
    uid
  ) returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'create_invitation_v1', 'invitations', v_new,
    jsonb_build_object('invitation_type', p_invitation_type,
      'organization_id', p_organization_id, 'project_id', p_project_id));

  return jsonb_build_object('outcome', 'created', 'invitation_id', v_new);
end $function$;

CREATE OR REPLACE FUNCTION public.respond_team_enquiry_v1(p_enquiry_id uuid, p_decision text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid          uuid := auth.uid();
  e            public.team_enquiries%rowtype;
  v_team_owner uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_decision not in ('accepted','declined') then
    return 'invalid_decision';
  end if;

  select * into e from public.team_enquiries
   where id = p_enquiry_id for update;
  if not found then return 'not_found'; end if;

  if e.owner_id = uid then return 'not_allowed'; end if;

  select owner_profile_id into v_team_owner
    from public.organizations where id = e.team_org_id;
  if not ((v_team_owner is not null and v_team_owner = uid) or public.manages_organization(e.team_org_id)) then
    return 'not_allowed';
  end if;

  if e.status <> 'created' then return 'not_open'; end if;

  if e.expires_at <= now() then
    update public.team_enquiries
       set status = 'expired', updated_at = now()
     where id = e.id;
    insert into public.team_enquiry_events
        (enquiry_id, actor_profile_id, event_type, from_status, to_status)
      values (e.id, uid, 'expired', 'created', 'expired');
    return 'not_open';
  end if;

  update public.team_enquiries
     set status = p_decision, updated_at = now()
   where id = e.id;

  insert into public.team_enquiry_events
      (enquiry_id, actor_profile_id, event_type, from_status, to_status)
    values (e.id, uid, p_decision, 'created', p_decision);

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'respond_team_enquiry_v1', 'team_enquiries', e.id,
    jsonb_build_object('decision', p_decision));

  return p_decision;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_team_details_v1(p_org_id uuid, p_availability_status text, p_available_from date, p_accommodation_needed boolean, p_transport_own boolean, p_max_trip_days integer, p_note text, p_deployable_size_min integer DEFAULT NULL::integer, p_deployable_size_max integer DEFAULT NULL::integer, p_destination_countries text[] DEFAULT NULL::text[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid         uuid := auth.uid();
  v_type      text;
  v_owner     uuid;
  v_note      text := nullif(trim(coalesce(p_note, '')), '');
  v_countries text[];
  v_code      text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select organization_type, owner_profile_id into v_type, v_owner
    from public.organizations where id = p_org_id;
  if not found then return 'not_found'; end if;
  if v_type <> 'team' then return 'not_a_team'; end if;
  if not (public.is_admin() or (v_owner is not null and v_owner = uid)
          or public.manages_organization(p_org_id)) then
    return 'not_allowed';
  end if;

  if p_availability_status is null or p_availability_status not in
       ('available_now','available_from','not_available') then
    return 'invalid_status';
  end if;
  if p_availability_status = 'available_from' and p_available_from is null then
    return 'date_required';
  end if;
  if p_max_trip_days is not null
     and (p_max_trip_days < 1 or p_max_trip_days > 365) then
    return 'invalid_trip_days';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    return 'note_too_long';
  end if;
  if (p_deployable_size_min is not null
      and (p_deployable_size_min < 1 or p_deployable_size_min > 200))
     or (p_deployable_size_max is not null
         and (p_deployable_size_max < 1 or p_deployable_size_max > 200))
     or (p_deployable_size_min is not null and p_deployable_size_max is not null
         and p_deployable_size_max < p_deployable_size_min) then
    return 'invalid_size';
  end if;

  if p_destination_countries is not null then
    if array_length(p_destination_countries, 1) > 30 then
      return 'invalid_countries';
    end if;
    v_countries := array[]::text[];
    foreach v_code in array p_destination_countries loop
      v_code := upper(trim(coalesce(v_code, '')));
      if v_code !~ '^[A-Z]{2}$' then
        return 'invalid_countries';
      end if;
      if not (v_code = any (v_countries)) then
        v_countries := v_countries || v_code;
      end if;
    end loop;
    if array_length(v_countries, 1) = 0 then
      v_countries := null;
    end if;
  end if;

  insert into public.team_details
      (org_id, availability_status, available_from,
       deployable_size_min, deployable_size_max, destination_countries,
       accommodation_needed, transport_own, max_trip_days, note, updated_at)
    values
      (p_org_id, p_availability_status,
       case when p_availability_status = 'available_from'
            then p_available_from else null end,
       p_deployable_size_min, p_deployable_size_max, v_countries,
       coalesce(p_accommodation_needed, false),
       coalesce(p_transport_own, false),
       p_max_trip_days, v_note, now())
  on conflict (org_id) do update set
       availability_status   = excluded.availability_status,
       available_from        = excluded.available_from,
       deployable_size_min   = excluded.deployable_size_min,
       deployable_size_max   = excluded.deployable_size_max,
       destination_countries = excluded.destination_countries,
       accommodation_needed  = excluded.accommodation_needed,
       transport_own         = excluded.transport_own,
       max_trip_days         = excluded.max_trip_days,
       note                  = excluded.note,
       updated_at            = now();

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'save_team_details_v1', 'team_details', p_org_id,
    jsonb_build_object('availability_status', p_availability_status));

  return 'saved';
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_team_capability_summary_v1(p_org_id uuid)
 RETURNS TABLE(skill_slug text, members_declared integer, members_confirmed integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid     uuid := auth.uid();
  v_owner uuid;
  v_type  text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select o.owner_profile_id, o.organization_type
    into v_owner, v_type
    from public.organizations o
   where o.id = p_org_id;
  if not found or v_type <> 'team' then
    return;
  end if;
  if not (public.is_admin()
          or (v_owner is not null and v_owner = uid)
          or public.manages_organization(p_org_id)) then
    return;
  end if;

  return query
  select s.slug,
         count(distinct w.id)::integer as members_declared,
         count(distinct w.id) filter (where ws.verified)::integer
           as members_confirmed
    from public.engagement_contexts ec
    join public.workers w        on w.profile_id = ec.profile_id
    join public.worker_skills ws on ws.worker_id = w.id
    join public.skills s         on s.id = ws.skill_id
   where ec.organization_id = p_org_id
     and ec.relationship_slug = 'employee'
     and ec.status = 'active'
   group by s.slug
   order by members_declared desc, s.slug
   limit 30;
end $function$;

-- Defense-in-depth (repo secdef-reproducibility closure idiom): CREATE OR
-- REPLACE preserves the existing ACLs — all six already revoke anon/PUBLIC —
-- but the canonical rule is that every post-closure migration re-defining a
-- SECURITY DEFINER function names the revoke explicitly, so the grant matrix
-- is reproducible from the migration text alone. None of these are anon-
-- reachable; authenticated/service_role grants are untouched.
revoke execute on function public.grant_org_manager(uuid, uuid, text) from public, anon;
revoke execute on function public.add_org_member(uuid, uuid) from public, anon;
revoke execute on function public.create_invitation_v1(text, text, text, text, uuid, uuid, text, text, text) from public, anon;
revoke execute on function public.respond_team_enquiry_v1(uuid, text) from public, anon;
revoke execute on function public.save_team_details_v1(uuid, text, date, boolean, boolean, integer, text, integer, integer, text[]) from public, anon;
revoke execute on function public.get_team_capability_summary_v1(uuid) from public, anon;
