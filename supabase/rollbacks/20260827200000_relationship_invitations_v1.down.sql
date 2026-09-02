-- ============================================================================
-- ROLLBACK for 20260827200000_relationship_invitations_v1.sql
--
-- Restores the 9-argument `create_invitation_v1` and the two-slug acceptance
-- CASE in both accept functions.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────────
-- It does NOT delete engagement_contexts rows created while the migration was
-- live. Those are REAL relationships that two people agreed to — an institution
-- offered and a learner accepted. Reverting a validation rule must never delete
-- history somebody entered (same convention as 20260714161000 and
-- 20260826182421). After this rollback those rows remain readable, remain
-- attributable, and remain endable through the normal end-engagement path.
--
-- It also does NOT drop `invitations.relationship_slug` or the two
-- `relationship_types` columns. Dropping a column is destructive and would
-- discard the only record of what a pending invitation was FOR; the columns are
-- inert once the functions below stop reading them. Dropping them is a separate,
-- separately-approved decision (ARCHITECTURE §9: no destructive cleanup).
--
-- CONSEQUENCE TO UNDERSTAND BEFORE RUNNING THIS: any invitation that is still
-- `pending` and carries relationship_slug='student' will, after this rollback,
-- accept into an `employee` engagement instead — the false statement the
-- migration existed to prevent. REVOKE those invitations first:
--
--   select id, invited_email, relationship_slug from public.invitations
--    where status = 'pending' and relationship_slug is not null;
--   -- then revoke_invitation_v1(id) for each, as the inviter or an admin.
-- ============================================================================

begin;

-- ── 1. Restore the 9-argument creator ───────────────────────────────────────
drop function if exists public.create_invitation_v1(
  text, text, text, text, uuid, uuid, text, text, text, text);

create or replace function public.create_invitation_v1(
  p_token_hash      text,
  p_invitation_type text,
  p_invited_email   text,
  p_invited_name    text default null,
  p_organization_id uuid default null,
  p_project_id      uuid default null,
  p_proposed_role   text default null,
  p_personal_message text default null,
  p_locale          text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    if not (public.is_admin() or v_org_owner = uid
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
end $$;

revoke all on function public.create_invitation_v1(
  text, text, text, text, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.create_invitation_v1(
  text, text, text, text, uuid, uuid, text, text, text) to authenticated;

-- ── 2. Restore the two-slug acceptance (token path) ─────────────────────────
create or replace function public.accept_invitation_v1(
  p_token text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  if v_row.invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner') then
    v_slug := case when v_row.invitation_type = 'collaborate_partner'
                   then 'collaborator' else 'employee' end;
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
      'organization_id', v_row.organization_id, 'project_id', v_row.project_id));

  return jsonb_build_object(
    'outcome', 'accepted',
    'relationship', v_relationship,
    'invitation_type', v_row.invitation_type,
    'organization_id', v_row.organization_id,
    'project_id', v_row.project_id
  );
end $$;

revoke all on function public.accept_invitation_v1(text) from public, anon;
grant execute on function public.accept_invitation_v1(text) to authenticated;

-- ── 3. Restore the two-slug acceptance (in-app path) ────────────────────────
create or replace function public.accept_invitation_by_id_v1(
  p_invitation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
      v_slug := case when v_token_row.invitation_type = 'collaborate_partner'
                     then 'collaborator' else 'employee' end;
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
        'relationship', v_relationship, 'relationship_id', v_new));

    return jsonb_build_object(
      'outcome', 'accepted',
      'relationship', v_relationship,
      'invitation_type', v_token_row.invitation_type,
      'organization_id', v_token_row.organization_id,
      'project_id', v_token_row.project_id
    );
  end;
end $$;

revoke all on function public.accept_invitation_by_id_v1(uuid) from public, anon;
grant execute on function public.accept_invitation_by_id_v1(uuid) to authenticated;

-- ── 4. Restore the preview without the relationship field ───────────────────
create or replace function public.get_invitation_preview_v1(
  p_token text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    'inviter_name', v_inviter_name
  );
end $$;

revoke all on function public.get_invitation_preview_v1(text) from public, anon;
grant execute on function public.get_invitation_preview_v1(text) to authenticated;


create or replace function public.list_invitations_for_me_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
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
end $$;

revoke all on function public.list_invitations_for_me_v1() from public, anon;
grant execute on function public.list_invitations_for_me_v1() to authenticated;

commit;
