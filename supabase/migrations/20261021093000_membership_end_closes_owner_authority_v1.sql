-- @human-gate-approved — owner approved PR #2607 (2026-10-21): ending a membership removes the management / administration authority it carried (governance engagements ended, owner pointer moved); employment and historical work records are not ended; invitations follow the authority behind them.
-- Conditions: within this defect's purpose, organization isolation kept, no unauthorized data change; verified in a rolled-back production test. Scope: this SQL only.
-- ============================================================================
-- 20261021093000_membership_end_closes_owner_authority_v1
--
-- SAFETY CLASS: RED (SECURITY DEFINER replace + one new internal SECURITY
-- DEFINER helper; UPDATEs inside function bodies only). Draft PR +
-- needs-human-gate. The `@human-gate-approved` marker is added ONLY after the
-- owner approves this exact file. ZERO rows change at apply time.
--
-- DEFECT (owner-approved fix programme 2026-10-21, "org rights" item 1).
-- Revoking an owner's governance membership (membership_revoke_v1), or an
-- owner pressing "Leave" (membership_leave_v1), changes ONLY the
-- company_memberships row. Every other grant path stays open:
--
--   organizations.owner_profile_id   read as "the owner" by
--       invitation_org_authority_v1 (20260924150000), disband_team_v1 and the brigade create door,
--       end_org_membership_v1, add_org_member, grant_org_manager,
--       validate_active_organization, organizations_select, and the app's
--       readOwnedOrganizations (lib/company/active-organization.ts ~461-475)
--       and getGovernedOrganizations;
--   engagement_contexts 'owner' / 'manager' / 'external_manager' (active)
--       read by manages_organization (0013 arm, 20260806180000), which ~40
--       RLS policies and SECURITY DEFINER guards consume, and by
--       validate_active_organization + the app's readEngagementMemberships /
--       getManagedOrganizationIds;
--   companies.profile_id (the creator)  read by owns_company's creator arm
--       (20260904060000) and by the app's employer context creator arm
--       (lib/company/employer-company-context.ts ~336);
--   the companies/agencies -> organizations MIRROR trigger (0013), which on
--       EVERY companies UPDATE rewrites organizations.owner_profile_id back to
--       companies.profile_id — so any ownership move is silently undone the
--       next time anyone (the new owner included, via save_company_setup_v3)
--       edits the company.
--
-- CHANGE (smallest coherent set, no table/column/policy/grant widening):
--   1. membership_close_governance_v1 (INTERNAL, no client grant): when an
--      ACTIVE membership ends, (a) end that person's governance-proxy
--      engagements (owner / manager / external_manager) in that organization —
--      status 'ended', ended_at, lifecycle_stage 'ended', ended_reason 'other',
--      ended_note, journal_review_enabled off, is_primary off; rows KEPT, one
--      engagement_lifecycle_events pair + one audit_logs row each, the same
--      shape end_org_membership_v1 / end_engagement_lifecycle_v1 write — and
--      (b) when organizations.owner_profile_id names that person, move it to
--      another ACTIVE owner membership (the acting owner first, else the
--      earliest accepted), or answer 'last_owner' so the caller refuses.
--      EMPLOYMENT engagements (employee, collaborator, ...) are never touched.
--   2. membership_revoke_v1 / membership_leave_v1: identical bodies plus the
--      call, inside the existing subtransaction, so a refusal rolls the
--      membership update back too. The existing last-owner trigger
--      (company_memberships_protect_last_owner, 20260806090000) still fires
--      first; both refusals surface as the existing 'last_owner' outcome.
--   3. mirror_company_to_org / mirror_agency_to_org: an UPDATE propagates
--      owner_profile_id ONLY when the creator column itself changed
--      (old.profile_id -> new.profile_id). Every other column mirrors exactly
--      as before.
--   4. owns_company: the creator arm no longer holds for a creator whose
--      membership in the bound organization was ENDED (a revoked row that had
--      been accepted) and who holds no active membership there. The membership
--      arm is unchanged.
--
-- DOCTRINE CONFLICT, NAMED (decision 0016 / A-14):
-- docs/architecture/COMPANY_MEMBERSHIPS_V1.md line 49 says "membership creates
-- NO engagement and ends NO engagement". The owner-approved programme
-- requires ending the owner/manager engagement on revoke/leave. Proposed
-- amendment (same PR): "membership ends no EMPLOYMENT engagement; ending a
-- governance membership ends that person's governance-proxy engagements
-- (owner / manager / external_manager) in that organization".
--
-- NOT CHANGED HERE (named, separate slices): membership_change_role_v1
-- demotion (owner -> admin/manager/member keeps owner_profile_id + 'owner'
-- engagement); 'viewer' engagements (validate_active_organization still lets
-- a viewer select the workspace); companies_update RLS and
-- save_company_setup_v3 still accept the creator (company identity edits);
-- org invitations the revoked person issued stay ORG-owned (20260817121000
-- doctrine) — the org authority sees and revokes them, and resend now
-- requires current authority (20261021094000).
--
-- Rollback: supabase/rollbacks/20261021093000_membership_end_closes_owner_authority_v1.down.sql
-- (restores the five previous bodies verbatim, drops the helper; data that
-- changed while this was live — ended engagements, moved owner pointers —
-- stays, because a rollback must never silently re-grant revoked authority).
-- ============================================================================

do $$
begin
  if to_regclass('public.company_memberships') is null then
    raise exception 'company_memberships missing — apply 20260806090000 first';
  end if;
  if to_regclass('public.engagement_lifecycle_events') is null then
    raise exception 'engagement_lifecycle_events missing — apply 20260817190000 first';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'engagement_contexts'
       and column_name in ('lifecycle_stage', 'ended_reason', 'ended_note', 'journal_review_enabled')
    having count(*) = 4
  ) then
    raise exception 'engagement_contexts lifecycle columns missing — apply 20260530140000 + 20260817190000 first';
  end if;
end $$;

-- ── 1. the one closing step (internal) ────────────────────────────────────
create or replace function public.membership_close_governance_v1(
  p_organization_id uuid,
  p_profile_id      uuid,
  p_actor           uuid,
  p_note            text
) returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner     uuid;
  v_successor uuid;
  v_ec        record;
  v_stage     text;
  v_note      text := left(nullif(trim(coalesce(p_note, '')), ''), 500);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_organization_id is null or p_profile_id is null then
    return 'nothing';
  end if;

  -- (b) the owner pointer. Locked so two concurrent leaves cannot both pick
  -- each other as the successor.
  select o.owner_profile_id into v_owner
    from public.organizations o
   where o.id = p_organization_id
   for update;
  if v_owner is not null and v_owner = p_profile_id then
    select m.profile_id into v_successor
      from public.company_memberships m
     where m.organization_id = p_organization_id
       and m.role = 'owner'
       and m.status = 'active'
       and m.profile_id <> p_profile_id
     order by (m.profile_id is not distinct from p_actor) desc,
              m.accepted_at asc nulls last, m.created_at asc, m.id asc
     limit 1;
    if v_successor is null then
      -- Never leave an organization without an owner.
      return 'last_owner';
    end if;
    update public.organizations
       set owner_profile_id = v_successor,
           updated_at = now()
     where id = p_organization_id;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (p_actor, 'organization_owner_moved', 'organizations', p_organization_id,
      jsonb_build_object('from_profile_id', p_profile_id,
        'to_profile_id', v_successor, 'reason', v_note));
  end if;

  -- (a) governance-proxy engagements end; employment is never touched.
  for v_ec in
    select ec.id, ec.relationship_slug, ec.status, ec.lifecycle_stage
      from public.engagement_contexts ec
     where ec.organization_id = p_organization_id
       and ec.profile_id = p_profile_id
       and ec.status in ('active', 'paused')
       and ec.relationship_slug in ('owner', 'manager', 'external_manager')
     order by ec.created_at
     for update
  loop
    v_stage := coalesce(v_ec.lifecycle_stage,
                        case when v_ec.status = 'ended' then 'ended' else 'active' end);
    update public.engagement_contexts
       set status                 = 'ended',
           ended_at               = coalesce(ended_at, current_date),
           journal_review_enabled = false,
           is_primary             = false,
           lifecycle_stage        = 'ended',
           ended_reason           = coalesce(ended_reason, 'other'),
           ended_note             = coalesce(ended_note, v_note),
           updated_at             = now()
     where id = v_ec.id
       and status <> 'ended';
    insert into public.engagement_lifecycle_events
      (engagement_context_id, actor_profile_id, action, before_stage, after_stage, note, metadata)
    values (v_ec.id, p_actor, 'engagement_ended', v_stage, 'ended', v_note,
            jsonb_build_object('reason', 'other', 'source', 'company_membership'));
    insert into public.engagement_lifecycle_events
      (engagement_context_id, actor_profile_id, action, before_stage, after_stage)
    values (v_ec.id, p_actor, 'stage_changed', v_stage, 'ended');
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (p_actor, 'end_org_membership', 'engagement_contexts', v_ec.id,
      jsonb_build_object(
        'organization_id', p_organization_id,
        'profile_id',      p_profile_id,
        'from_role',       v_ec.relationship_slug,
        'to_role',         'ended',
        'from_status',     v_ec.status,
        'to_status',       'ended',
        'actor_capacity',  'membership_command',
        'self_initiated',  (p_profile_id is not distinct from p_actor),
        'reason',          v_note));
  end loop;

  return 'closed';
end $$;

revoke all on function public.membership_close_governance_v1(uuid, uuid, uuid, text) from public;
revoke all on function public.membership_close_governance_v1(uuid, uuid, uuid, text) from anon;
revoke all on function public.membership_close_governance_v1(uuid, uuid, uuid, text) from authenticated;

-- ── 2. revoke ─────────────────────────────────────────────────────────────
create or replace function public.membership_revoke_v1(p_membership_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  m record;
  actor_role text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select id, organization_id, profile_id, role, status into m
    from public.company_memberships where id = p_membership_id;
  if m.id is null then return 'not_found'; end if;

  actor_role := public.membership_actor_role_v1(uid, m.organization_id);
  if actor_role is null or actor_role not in ('owner','admin') then
    return 'not_found';  -- merged with missing — no oracle
  end if;
  if actor_role = 'admin' and m.role in ('owner','admin') and m.profile_id <> uid then
    return 'not_authorized';
  end if;
  if m.status = 'revoked' then return 'not_active'; end if;

  begin
    update public.company_memberships
       set status = 'revoked', revoked_at = now()
     where id = p_membership_id and status in ('invited','active');
    -- An ACTIVE membership ending closes the person's other grant paths in
    -- the same subtransaction: owner pointer moved (or refused) and the
    -- governance-proxy engagements ended.
    if m.status = 'active' then
      if coalesce(public.membership_close_governance_v1(
            m.organization_id, m.profile_id, uid, 'governance_membership_revoked') = 'last_owner', false) then
        raise exception 'last_owner_membership' using errcode = '23514';
      end if;
    end if;
  exception when check_violation then
    if sqlerrm = 'last_owner_membership' then return 'last_owner'; end if;
    raise;
  end;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'membership_revoke', 'company_memberships', p_membership_id,
    jsonb_build_object('organization_id', m.organization_id,
      'revoked_profile_id', m.profile_id, 'revoked_role', m.role,
      'result', 'revoked'));
  return 'revoked';
end $$;

-- ── 3. leave (self-revocation) ────────────────────────────────────────────
create or replace function public.membership_leave_v1(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  m record;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select id, status into m from public.company_memberships
   where organization_id = p_organization_id and profile_id = uid
     and status in ('invited','active') limit 1;
  if m.id is null then return 'not_a_member'; end if;

  begin
    update public.company_memberships
       set status = 'revoked', revoked_at = now()
     where id = m.id;
    if m.status = 'active' then
      if coalesce(public.membership_close_governance_v1(
            p_organization_id, uid, uid, 'governance_membership_left') = 'last_owner', false) then
        raise exception 'last_owner_membership' using errcode = '23514';
      end if;
    end if;
  exception when check_violation then
    if sqlerrm = 'last_owner_membership' then return 'last_owner'; end if;
    raise;
  end;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'membership_leave', 'company_memberships', m.id,
    jsonb_build_object('organization_id', p_organization_id, 'result', 'left'));
  return 'left';
end $$;

revoke all on function public.membership_revoke_v1(uuid) from public;
revoke all on function public.membership_revoke_v1(uuid) from anon;
grant execute on function public.membership_revoke_v1(uuid) to authenticated;
revoke all on function public.membership_leave_v1(uuid) from public;
revoke all on function public.membership_leave_v1(uuid) from anon;
grant execute on function public.membership_leave_v1(uuid) to authenticated;

-- ── 4. the mirror no longer re-grants ownership on every company edit ─────
create or replace function public.mirror_company_to_org()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.organizations
      (owner_profile_id, organization_type, legal_name, display_name, country,
       vat_number, website, description, trust_score, legacy_company_id)
    values
      (new.profile_id, 'company', new.legal_name, new.display_name, new.country,
       new.vat_number, new.website, new.description, new.trust_score, new.id);
  elsif (tg_op = 'UPDATE') then
    update public.organizations set
      -- The creator column moves the owner pointer only when IT changed; a
      -- plain company edit never hands ownership back to the creator.
      owner_profile_id = case when new.profile_id is distinct from old.profile_id
                              then new.profile_id else owner_profile_id end,
      legal_name = new.legal_name,
      display_name = new.display_name, country = new.country,
      vat_number = new.vat_number, website = new.website,
      description = new.description, trust_score = new.trust_score,
      updated_at = now()
    where legacy_company_id = new.id;
  end if;
  return new;
end $$;

create or replace function public.mirror_agency_to_org()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.organizations
      (owner_profile_id, organization_type, legal_name, country, description, legacy_agency_id)
    values
      (new.profile_id, 'agency', new.legal_name, new.country, new.description, new.id);
  elsif (tg_op = 'UPDATE') then
    update public.organizations set
      owner_profile_id = case when new.profile_id is distinct from old.profile_id
                              then new.profile_id else owner_profile_id end,
      legal_name = new.legal_name,
      country = new.country, description = new.description, updated_at = now()
    where legacy_agency_id = new.id;
  end if;
  return new;
end $$;

-- Trigger-only: no client role may call them (20260722160000 §4c state).
revoke all on function public.mirror_company_to_org() from public;
revoke all on function public.mirror_company_to_org() from anon;
revoke all on function public.mirror_company_to_org() from authenticated;
revoke all on function public.mirror_agency_to_org() from public;
revoke all on function public.mirror_agency_to_org() from anon;
revoke all on function public.mirror_agency_to_org() from authenticated;

-- ── 5. owns_company: an ended creator is no longer an owner-equivalent ────
create or replace function public.owns_company(c uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.companies x
     where x.id = c and x.profile_id = auth.uid()
       -- the creator arm is compatibility for creators who never had their
       -- governance ENDED; a creator whose accepted membership in the bound
       -- organization was revoked (and who holds no active one) is not one
       and not exists (
         select 1
           from public.organizations o
           join public.company_memberships r on r.organization_id = o.id
          where o.legacy_company_id = c
            and r.profile_id = auth.uid()
            and r.status = 'revoked'
            and r.accepted_at is not null
            and not exists (
              select 1 from public.company_memberships l
               where l.organization_id = o.id
                 and l.profile_id = auth.uid()
                 and l.status = 'active'
            )
       )
  )
  or exists (
    select 1
      from public.organizations o
      join public.company_memberships m on m.organization_id = o.id
     where o.legacy_company_id = c
       and m.profile_id = auth.uid()
       and m.status = 'active'
       and m.role in ('owner', 'admin')
  )
$$;

revoke all on function public.owns_company(uuid) from public;
revoke all on function public.owns_company(uuid) from anon;
grant execute on function public.owns_company(uuid) to authenticated;

-- ── 5. Creator gates follow the ended membership (review of #2607) ─────────
-- Ending a membership ended the person's governance engagements and the
-- owner pointer, and owns_company stopped counting a revoked creator, but
-- two creator-only gates still let them act: the creator arms of
-- save_company_setup_v3 (company identity) and owns_agency (agency
-- operations). set_company_description_v1 already goes through owns_company
-- (above). The companies / agencies UPDATE / DELETE policies are not changed:
-- authenticated holds no UPDATE / DELETE privilege on either table (only
-- column SELECT on companies), so every write goes through these functions.
-- One rule closes both:
-- creator_governance_ended_v1(org) — the caller has an ACCEPTED membership
-- in that organization that is now revoked, and no active one. A creator who
-- never had a membership row is unaffected; an active member is unaffected.
-- Nothing is deleted; companies.profile_id (who created it) stays history.

create or replace function public.creator_governance_ended_v1(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_organization_id is not null
     and exists (
       select 1 from public.company_memberships r
        where r.organization_id = p_organization_id
          and r.profile_id = auth.uid()
          and r.status = 'revoked'
          and r.accepted_at is not null)
     and not exists (
       select 1 from public.company_memberships l
        where l.organization_id = p_organization_id
          and l.profile_id = auth.uid()
          and l.status = 'active')
$$;

create or replace function public.company_creator_governance_ended_v1(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(public.creator_governance_ended_v1(
    (select o.id from public.organizations o where o.legacy_company_id = p_company_id limit 1)), false)
$$;

create or replace function public.agency_creator_governance_ended_v1(p_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(public.creator_governance_ended_v1(
    (select o.id from public.organizations o where o.legacy_agency_id = p_agency_id limit 1)), false)
$$;

-- Read only about the caller's OWN membership; definer functions and any
-- future policy call them as the caller, so authenticated keeps EXECUTE; never anon.
revoke all on function public.creator_governance_ended_v1(uuid) from public, anon;
revoke all on function public.company_creator_governance_ended_v1(uuid) from public, anon;
revoke all on function public.agency_creator_governance_ended_v1(uuid) from public, anon;
grant execute on function public.creator_governance_ended_v1(uuid) to authenticated;
grant execute on function public.company_creator_governance_ended_v1(uuid) to authenticated;
grant execute on function public.agency_creator_governance_ended_v1(uuid) to authenticated;

create or replace function public.owns_agency(a uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.agencies x
     where x.id = a and x.profile_id = auth.uid()
       and not public.agency_creator_governance_ended_v1(a)
  )
$function$;

-- Grants exactly as in production (authenticated only), restated explicitly.
revoke all on function public.owns_agency(uuid) from public;
revoke all on function public.owns_agency(uuid) from anon;
grant execute on function public.owns_agency(uuid) to authenticated;

-- save_company_setup_v3: the creator arm of the EDIT guard and of the
-- UPDATE narrows the same way (body otherwise byte-identical to
-- 20260806180000).
create or replace function public.save_company_setup_v3(
  p_company_id        uuid,
  p_legal_name        text,
  p_country           text,
  p_registration_code text,
  p_address           text,
  p_website           text,
  p_contact_email     text,
  p_contact_phone     text,
  p_requester_role    text,
  p_submit            boolean,
  p_company_type      text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid              uuid := auth.uid();
  company_uuid     uuid;
  cleaned_name     text := nullif(trim(coalesce(p_legal_name, '')), '');
  c_country        text := nullif(trim(coalesce(p_country, '')), '');
  c_email          text := nullif(trim(coalesce(p_contact_email, '')), '');
  c_website        text := nullif(trim(coalesce(p_website, '')), '');
  c_regcode        text := nullif(trim(coalesce(p_registration_code, '')), '');
  c_type           text := nullif(trim(lower(coalesce(p_company_type, ''))), '');
  current_status   text;
  existing_country text;
  effective_country text;
  automated        text;
  next_status      text;
  can_edit         boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if cleaned_name is null or length(cleaned_name) < 2 or length(cleaned_name) > 200 then
    raise exception 'invalid_legal_name' using errcode = '22023';
  end if;

  if c_type is not null and c_type not in (
    'construction','staffing_agency','subcontractor',
    'manufacturing','services','client_customer','other'
  ) then
    raise exception 'invalid_company_type' using errcode = '22023';
  end if;

  if c_country is not null and not exists (
    select 1 from public.countries where code = c_country
  ) then
    raise exception 'invalid_country' using errcode = '22023';
  end if;

  insert into public.profile_roles (profile_id, role, is_active, role_data)
  values (uid, 'company', true, '{}'::jsonb)
  on conflict (profile_id, role) do update
     set is_active = true;

  if p_company_id is not null then
    -- EDIT: exactly the named row, if the caller created it OR holds an
    -- ACTIVE owner/admin membership on the organization bound to it
    -- (M-P0-4 §11: membership proves the role; manager-class roles run
    -- operations and do NOT edit company identity). Same error for "not
    -- yours" and "does not exist" — no existence oracle.
    can_edit := exists (
      select 1 from public.companies c
       where c.id = p_company_id
         and (
           (c.profile_id = uid and not public.company_creator_governance_ended_v1(c.id))
           or exists (
             select 1
               from public.organizations o
               join public.company_memberships m on m.organization_id = o.id
              where o.legacy_company_id = c.id
                and m.profile_id = uid
                and m.status = 'active'
                and m.role in ('owner','admin')
           )
         )
    );
    if not can_edit then
      raise exception 'not_owner' using errcode = '42501';
    end if;
    select verification_status, country
      into current_status, existing_country
      from public.companies
     where id = p_company_id;
  end if;

  effective_country := coalesce(c_country, existing_country);
  automated := case
    when effective_country is null then 'needs_checks'
    when c_email is not null
         and c_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      then 'needs_checks'
    when c_website is not null
         and c_website !~* '^(https?://)?([a-z0-9-]+\.)+[a-z]{2,}(/.*)?$'
      then 'needs_checks'
    when c_regcode is not null
         and c_regcode !~* '^[a-z0-9 ._/-]{3,40}$'
      then 'needs_checks'
    else 'active_unverified'
  end;

  if current_status = 'verified' then
    next_status := 'verified';                  -- stays verified (admin set it)
  elsif p_submit then
    next_status := 'pending_verification';       -- OPTIONAL manual-review escalation
  else
    next_status := automated;                    -- automatic-first default
  end if;

  if p_company_id is not null then
    update public.companies set
      legal_name          = cleaned_name,
      display_name        = cleaned_name,
      company_type        = coalesce(c_type, company_type),
      country             = coalesce(c_country, country),
      registration_code   = coalesce(c_regcode, registration_code),
      address             = coalesce(nullif(trim(coalesce(p_address, '')), ''), address),
      website             = coalesce(c_website, website),
      contact_email       = coalesce(c_email, contact_email),
      contact_phone       = coalesce(nullif(trim(coalesce(p_contact_phone, '')), ''), contact_phone),
      requester_role      = coalesce(nullif(trim(coalesce(p_requester_role, '')), ''), requester_role),
      verification_status = next_status,
      requested_at        = case when p_submit then now() else requested_at end,
      updated_at          = now()
    where id = p_company_id
      and (
        (profile_id = uid and not public.company_creator_governance_ended_v1(public.companies.id))
        or exists (
          select 1
            from public.organizations o
            join public.company_memberships m on m.organization_id = o.id
           where o.legacy_company_id = public.companies.id
             and m.profile_id = uid
             and m.status = 'active'
             and m.role in ('owner','admin')
        )
      )
    returning id into company_uuid;
    if company_uuid is null then
      -- The row vanished between the guard and the UPDATE — fail closed.
      raise exception 'not_owner' using errcode = '42501';
    end if;
  else
    -- CREATE: insert-only. Never renames, never upserts, never falls back.
    begin
      insert into public.companies (
        profile_id, legal_name, display_name, company_type, country,
        registration_code, address, website, contact_email, contact_phone,
        requester_role, verification_status, requested_at
      ) values (
        uid, cleaned_name, cleaned_name, coalesce(c_type, 'other'), c_country,
        c_regcode, nullif(trim(coalesce(p_address, '')), ''), c_website, c_email,
        nullif(trim(coalesce(p_contact_phone, '')), ''),
        nullif(trim(coalesce(p_requester_role, '')), ''),
        next_status,
        case when p_submit then now() else null end
      )
      returning id into company_uuid;
    exception when unique_violation then
      -- M-P0-1's canonical key: same creator, same canonical legal name.
      raise exception 'duplicate_company' using errcode = '23505';
    end;
  end if;

  return company_uuid;
end $$;

revoke all on function public.save_company_setup_v3(uuid, text, text, text, text, text, text, text, text, boolean, text) from public;
revoke all on function public.save_company_setup_v3(uuid, text, text, text, text, text, text, text, text, boolean, text) from anon;
grant execute on function public.save_company_setup_v3(uuid, text, text, text, text, text, text, text, text, boolean, text) to authenticated;
