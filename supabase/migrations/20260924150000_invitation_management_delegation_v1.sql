-- ============================================================================
-- 20260924150000 — invitation_management_delegation_v1
--
-- Owner direction 2026-09-24 (COMPANY PERMISSIONS): invitation management is
-- NOT a job title. The owner controls who may manage invitations and may
-- delegate it to a person; a manager / recruiter WITHOUT that grant receives
-- no invitation-management access.
--
-- RED by rule (new SECURITY DEFINER function, redefined SECURITY DEFINER
-- functions, ALTER POLICY, GRANT/REVOKE). Prepared as a DRAFT; NOT to be
-- applied without the owner's explicit approval of THIS file.
--
-- @human-gate-approved
--   Acknowledged RED by route. NOT an approval to apply.
--
-- ----------------------------------------------------------------------------
-- WHAT IT DOES (and nothing else)
-- ----------------------------------------------------------------------------
--   1. company_memberships.manages_invitations boolean NOT NULL DEFAULT false —
--      the per-person delegation, on the canonical person↔organization
--      governance row. Default false: nobody is delegated by this migration.
--      authenticated has no UPDATE on company_memberships; the flag is written
--      ONLY by (6).
--   2. invitation_org_authority_v1(org) — the ONE org-invitation authority,
--      already used by invitations_select, revoke / resend / mark-delivery —
--      becomes: the organization's owner_profile_id, or an ACTIVE membership
--      that is owner/admin by role or carries manages_invitations. The
--      title-based arms (manager / external_manager membership, manager /
--      external_manager / owner engagement via manages_organization) no
--      longer admit org invitations.
--   3. create_invitation_v1 / create_invitation_v2 — the org-context branch
--      (join_organization, join_team, join_as_employee, collaborate_partner)
--      checks invitation_org_authority_v1 instead of manages_organization.
--      ONE expression per function; the bodies are otherwise byte-identical to
--      production (md5 verified against pg_proc.prosrc before this draft).
--      join_project (can_manage_project) and invite_to_demand
--      (manages_organization of the need's organization) are NOT changed.
--   4. invite_company_worker — owns_company(company) OR
--      invitation_company_authority_v1(company) (NEW definer helper: the same
--      authority for the organization bound to that company). Body otherwise
--      byte-identical to production.
--   5. company_worker_invitations_select — + the same helper, so a delegated
--      person sees the pending list they manage.
--   6. membership_set_invitation_manager_v1(membership, enabled) — owner or
--      admin of the organization grants / withdraws the delegation for an
--      ACTIVE non-owner/admin member; audit_logs row (house pattern of the
--      membership commands). Admin may not touch owner rows (same rule as
--      membership_change_role_v1).
--
--   NOT touched: roles, the capability matrix's other capabilities,
--   membership_invite_v1 (governance membership invitations stay owner/admin
--   — delegating them would let a delegate add admins), projects, demand,
--   archived-organization behaviour, every other table, policy and grant.
--
-- PRODUCTION FACTS (read-only, 2026-09-24): 2 active manager memberships;
--   0 active manager / external_manager engagements; 3 organization
--   invitations exist, all created by the organization's owner — so no
--   existing invitation loses its manager. No backfill: the owner grants.
--
-- ORDER: apply FIRST (the deployed app never offers org invitations to a
--   manager, and the People page already gates on manage-invitations), THEN
--   merge the app half (reads the flag, adds the owner's grant control).
--
-- ROLLBACK: supabase/rollbacks/20260924150000_invitation_management_delegation_v1.down.sql
-- ============================================================================

-- ── 1. the delegation, on the membership row ──────────────────────────────
alter table public.company_memberships
  add column if not exists manages_invitations boolean not null default false;

comment on column public.company_memberships.manages_invitations is
  'Owner direction 2026-09-24: the owner (or an admin) delegated invitation management to this member. Written only by membership_set_invitation_manager_v1. Owner and admin hold it by role; a job title never grants it.';

-- ── 2. the one org-invitation authority ───────────────────────────────────
create or replace function public.invitation_org_authority_v1(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.invitation_org_authority_v1(uuid) from public;
revoke all on function public.invitation_org_authority_v1(uuid) from anon;
grant execute on function public.invitation_org_authority_v1(uuid) to authenticated;

-- The same authority asked by COMPANY (the legacy company_worker_invitations
-- key): the organization bound to it through organizations.legacy_company_id.
-- SECURITY DEFINER so the policy in (5) does not depend on the organizations
-- table's own RLS for the caller.
create or replace function public.invitation_company_authority_v1(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_company_id is not null and exists (
    select 1 from public.organizations o
     where o.legacy_company_id = p_company_id
       and public.invitation_org_authority_v1(o.id)
  )
$$;

revoke all on function public.invitation_company_authority_v1(uuid) from public;
revoke all on function public.invitation_company_authority_v1(uuid) from anon;
grant execute on function public.invitation_company_authority_v1(uuid) to authenticated;

-- ── 3a. create_invitation_v1 — org branch uses the authority above ────────
create or replace function public.create_invitation_v1(
  p_token_hash      text,
  p_invitation_type text,
  p_invited_email   text,
  p_invited_name    text default null,
  p_organization_id uuid default null,
  p_project_id      uuid default null,
  p_proposed_role   text default null,
  p_personal_message text default null,
  p_locale          text default null,
  p_relationship_slug text default null
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
  v_rel         text := nullif(trim(coalesce(p_relationship_slug, '')), '');
  v_needs_role  text;
  v_invitable   boolean;
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

  -- Context + sender permission, server-side.
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
            or public.invitation_org_authority_v1(p_organization_id)) then
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

  -- ── NEW: the relationship, when one is named ──────────────────────────────
  -- Absent → the historical per-type default, and this block is inert.
  if v_rel is not null then
    -- Only an organization-scoped invitation establishes a person↔organization
    -- relationship. A platform or project invitation has no organization for
    -- the relationship to be WITH, so naming one is a caller error.
    if p_invitation_type not in
         ('join_organization','join_team','join_as_employee','collaborate_partner') then
      return jsonb_build_object('outcome', 'invalid_relationship');
    end if;

    select rt.invitable, rt.requires_organization_role
      into v_invitable, v_needs_role
      from public.relationship_types rt
     where rt.slug = v_rel and rt.is_active;
    -- Unknown, inactive, or not offerable → refused. Fail-closed: a slug that
    -- nobody deliberately marked invitable is not invitable.
    if not found or not coalesce(v_invitable, false) then
      return jsonb_build_object('outcome', 'invalid_relationship');
    end if;

    -- The capability gate. An organization may only establish a relationship
    -- it has declared it is in the business of: calling someone your student
    -- is a claim about what your organization does.
    if v_needs_role is not null and not exists (
      select 1 from public.organization_roles r
       where r.organization_id = p_organization_id
         and r.role_slug = v_needs_role
    ) then
      return jsonb_build_object('outcome', 'organization_capability_required');
    end if;
  end if;

  -- Abuse caps (per inviter): 100 open, 30 created in the last 24h.
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

  -- One live invitation per (inviter, email, type, context, relationship).
  -- The relationship joins the key: inviting the same person as a learner AND
  -- as an employee are two different offers, and neither should silently
  -- swallow the other.
  if exists (
    select 1 from public.invitations
     where inviter_profile_id = uid
       and lower(invited_email) = v_email
       and invitation_type = p_invitation_type
       and coalesce(organization_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_organization_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(project_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_project_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(relationship_slug, '') = coalesce(v_rel, '')
       and status = 'pending'
       and expires_at > now()
  ) then
    return jsonb_build_object('outcome', 'duplicate_pending');
  end if;

  insert into public.invitations (
    token_hash, invitation_type, organization_id, project_id,
    invited_email, invited_name, proposed_role, personal_message,
    locale, inviter_profile_id, relationship_slug
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
    uid,
    v_rel
  ) returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'create_invitation_v1', 'invitations', v_new,
    jsonb_build_object('invitation_type', p_invitation_type,
      'organization_id', p_organization_id, 'project_id', p_project_id,
      'relationship_slug', v_rel));

  return jsonb_build_object('outcome', 'created', 'invitation_id', v_new);
end $$;

revoke all on function public.create_invitation_v1(text, text, text, text, uuid, uuid, text, text, text, text) from public;
revoke all on function public.create_invitation_v1(text, text, text, text, uuid, uuid, text, text, text, text) from anon;
grant execute on function public.create_invitation_v1(text, text, text, text, uuid, uuid, text, text, text, text) to authenticated;

-- ── 3b. create_invitation_v2 — org branch uses the authority above ────────
create or replace function public.create_invitation_v2(
  p_token_hash        text,
  p_invitation_type   text,
  p_invited_email     text default null,
  p_invited_name      text default null,
  p_organization_id   uuid default null,
  p_project_id        uuid default null,
  p_target_request_id uuid default null,
  p_proposed_role     text default null,
  p_personal_message  text default null,
  p_locale            text default null,
  p_relationship_slug text default null,
  p_max_uses          integer default 1,
  p_campaign_label    text default null,
  p_expires_in_days   integer default 14
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
  v_rel         text := nullif(trim(coalesce(p_relationship_slug, '')), '');
  v_needs_role  text;
  v_invitable   boolean;
  v_max         int := coalesce(p_max_uses, 1);
  v_days        int := coalesce(p_expires_in_days, 14);
  v_req_owner   uuid;
  v_req_org     uuid;
  v_req_status  text;
  v_has_context boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('outcome', 'invalid_token_hash');
  end if;
  if p_invitation_type not in ('join_platform','join_organization','join_team',
      'join_as_employee','collaborate_partner','join_project','invite_company',
      'invite_to_demand') then
    return jsonb_build_object('outcome', 'invalid_type');
  end if;
  -- An addressee is optional (open link); when given it must be an address.
  if v_email is not null and (
       v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
       or char_length(v_email) > 254) then
    return jsonb_build_object('outcome', 'invalid_email');
  end if;
  if v_max < 1 or v_max > 500 then
    return jsonb_build_object('outcome', 'invalid_max_uses');
  end if;
  if v_days < 1 or v_days > 90 then
    return jsonb_build_object('outcome', 'invalid_expiry');
  end if;

  -- Context + sender permission, server-side.
  v_has_context := false;
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
            or public.invitation_org_authority_v1(p_organization_id)) then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
    v_has_context := true;
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
    v_has_context := true;
  elsif p_invitation_type = 'invite_to_demand' then
    -- THE EMPLOYER FOUND THE PERSON. The target is the canonical demand
    -- object and nothing else; the inviter must own it or manage the
    -- organization it belongs to. A closed need cannot be invited to.
    if p_target_request_id is null then
      return jsonb_build_object('outcome', 'demand_required');
    end if;
    select profile_id, organization_id, status
      into v_req_owner, v_req_org, v_req_status
      from public.customer_requests where id = p_target_request_id;
    if not found then
      return jsonb_build_object('outcome', 'demand_not_found');
    end if;
    if not (public.is_admin() or v_req_owner = uid
            or (v_req_org is not null and public.manages_organization(v_req_org))) then
      return jsonb_build_object('outcome', 'not_authorized');
    end if;
    if v_req_status = 'closed' then
      return jsonb_build_object('outcome', 'demand_closed');
    end if;
    v_has_context := true;
  end if;

  -- MULTI-USE IS A CONTEXT PRIVILEGE. A link that 30 people may use belongs
  -- to an organization, a project or a need someone is answerable for. A
  -- plain "invite a colleague" link stays bounded to a crew-sized number.
  if v_max > 1 and not v_has_context and v_max > 20 then
    return jsonb_build_object('outcome', 'invalid_max_uses');
  end if;

  -- The relationship, when one is named (v1 block, unchanged).
  if v_rel is not null then
    if p_invitation_type not in
         ('join_organization','join_team','join_as_employee','collaborate_partner') then
      return jsonb_build_object('outcome', 'invalid_relationship');
    end if;
    select rt.invitable, rt.requires_organization_role
      into v_invitable, v_needs_role
      from public.relationship_types rt
     where rt.slug = v_rel and rt.is_active;
    if not found or not coalesce(v_invitable, false) then
      return jsonb_build_object('outcome', 'invalid_relationship');
    end if;
    if v_needs_role is not null and not exists (
      select 1 from public.organization_roles r
       where r.organization_id = p_organization_id
         and r.role_slug = v_needs_role
    ) then
      return jsonb_build_object('outcome', 'organization_capability_required');
    end if;
  end if;

  -- Abuse caps (per inviter): 100 open, 30 created in the last 24h (v1).
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

  -- One live ADDRESSED invitation per (inviter, email, type, context,
  -- relationship) — v1 rule; an open link has no addressee to collide on.
  if v_email is not null and exists (
    select 1 from public.invitations
     where inviter_profile_id = uid
       and lower(invited_email) = v_email
       and invitation_type = p_invitation_type
       and coalesce(organization_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_organization_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(project_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_project_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(target_request_id, '00000000-0000-0000-0000-000000000000')
         = coalesce(p_target_request_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(relationship_slug, '') = coalesce(v_rel, '')
       and status = 'pending'
       and expires_at > now()
  ) then
    return jsonb_build_object('outcome', 'duplicate_pending');
  end if;

  insert into public.invitations (
    token_hash, invitation_type, organization_id, project_id, target_request_id,
    invited_email, invited_name, proposed_role, personal_message,
    locale, inviter_profile_id, relationship_slug,
    max_uses, campaign_label, expires_at
  ) values (
    p_token_hash, p_invitation_type,
    case when p_invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner')
         then p_organization_id else null end,
    case when p_invitation_type = 'join_project' then p_project_id else null end,
    case when p_invitation_type = 'invite_to_demand' then p_target_request_id else null end,
    v_email,
    nullif(trim(coalesce(p_invited_name, '')), ''),
    nullif(trim(coalesce(p_proposed_role, '')), ''),
    nullif(trim(coalesce(p_personal_message, '')), ''),
    case when p_locale ~ '^[a-z]{2}$' then p_locale else null end,
    uid,
    v_rel,
    v_max,
    nullif(trim(coalesce(p_campaign_label, '')), ''),
    now() + make_interval(days => v_days)
  ) returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'create_invitation_v2', 'invitations', v_new,
    jsonb_build_object('invitation_type', p_invitation_type,
      'organization_id', p_organization_id, 'project_id', p_project_id,
      'target_request_id', p_target_request_id,
      'relationship_slug', v_rel, 'max_uses', v_max,
      'addressed', v_email is not null));

  return jsonb_build_object('outcome', 'created', 'invitation_id', v_new);
end $$;

revoke all on function public.create_invitation_v2(text, text, text, text, uuid, uuid, uuid, text, text, text, text, integer, text, integer) from public;
revoke all on function public.create_invitation_v2(text, text, text, text, uuid, uuid, uuid, text, text, text, text, integer, text, integer) from anon;
grant execute on function public.create_invitation_v2(text, text, text, text, uuid, uuid, uuid, text, text, text, text, integer, text, integer) to authenticated;

-- ── 4. invite_company_worker — owner/admin OR the delegated person ────────
create or replace function public.invite_company_worker(p_company_id uuid, p_email text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid            uuid := auth.uid();
  normalised_em  text := lower(trim(p_email));
  existing_link  uuid;
  existing_inv   uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.owns_company(p_company_id)
          or public.invitation_company_authority_v1(p_company_id)) then
    return 'not_owner';
  end if;
  if normalised_em is null
     or not (normalised_em ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') then
    return 'invalid_email';
  end if;
  select cw.worker_id into existing_link
  from public.company_workers cw
  join public.workers w  on w.id = cw.worker_id
  join public.profiles p on p.id = w.profile_id
  where cw.company_id = p_company_id
    and lower(p.email) = normalised_em
  limit 1;
  if existing_link is not null then
    return 'already_linked';
  end if;
  select id into existing_inv
  from public.company_worker_invitations
  where company_id = p_company_id
    and lower(invited_email) = normalised_em
    and status = 'pending'
  limit 1;
  if existing_inv is not null then
    return 'already_pending';
  end if;
  insert into public.company_worker_invitations (
    company_id, invited_email, status, inviter_profile_id, note
  ) values (
    p_company_id, normalised_em, 'pending', uid, nullif(trim(coalesce(p_note,'')), '')
  )
  on conflict (company_id, invited_email) do update
    set status = 'pending', inviter_profile_id = excluded.inviter_profile_id, note = excluded.note;
  return 'invited';
end $$;

revoke all on function public.invite_company_worker(uuid, text, text) from public;
revoke all on function public.invite_company_worker(uuid, text, text) from anon;
grant execute on function public.invite_company_worker(uuid, text, text) to authenticated;

-- ── 5. the pending list: + the delegated person ───────────────────────────
alter policy company_worker_invitations_select on public.company_worker_invitations
  using (
    owns_company(company_id)
    or lower(invited_email) = lower(nullif(auth.jwt() ->> 'email', ''))
    or is_admin()
    or public.invitation_company_authority_v1(company_id)
  );

-- ── 6. the owner's grant: one command, audited ────────────────────────────
create or replace function public.membership_set_invitation_manager_v1(
  p_membership_id uuid, p_enabled boolean
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m record;
  actor_role text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_enabled is null then return 'invalid'; end if;

  select id, organization_id, profile_id, role, status, manages_invitations into m
    from public.company_memberships where id = p_membership_id;
  if m.id is null then return 'not_found'; end if;

  actor_role := public.membership_actor_role_v1(uid, m.organization_id);
  if actor_role is null or actor_role not in ('owner', 'admin') then
    return 'not_found';  -- merged with missing — no oracle
  end if;
  if m.status <> 'active' then return 'not_active'; end if;
  -- Owner and admin hold it by role; there is nothing to delegate to them.
  if m.role in ('owner', 'admin') then return 'held_by_role'; end if;
  if m.manages_invitations = p_enabled then return 'unchanged'; end if;

  update public.company_memberships
     set manages_invitations = p_enabled
   where id = p_membership_id and status = 'active';

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'membership_set_invitation_manager', 'company_memberships', p_membership_id,
    jsonb_build_object('organization_id', m.organization_id,
      'member_profile_id', m.profile_id, 'member_role', m.role,
      'from', m.manages_invitations, 'to', p_enabled,
      'result', case when p_enabled then 'granted' else 'withdrawn' end));
  return case when p_enabled then 'granted' else 'withdrawn' end;
end $$;

revoke all on function public.membership_set_invitation_manager_v1(uuid, boolean) from public;
revoke all on function public.membership_set_invitation_manager_v1(uuid, boolean) from anon;
grant execute on function public.membership_set_invitation_manager_v1(uuid, boolean) to authenticated;
