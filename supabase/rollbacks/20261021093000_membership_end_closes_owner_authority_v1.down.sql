-- ============================================================================
-- ROLLBACK of 20261021093000_membership_end_closes_owner_authority_v1
--
-- Restores the five previous bodies VERBATIM:
--   membership_revoke_v1, membership_leave_v1  <- 20260806120000_company_membership_commands_v1
--   mirror_company_to_org, mirror_agency_to_org <- 0013_work_journal_m1
--   owns_company                                <- 20260904060000_owns_company_governance_membership_v1
-- with their privilege state restated, then drops the internal helper.
--
-- DATA IS NOT TOUCHED. Engagements ended and owner pointers moved while the
-- migration was live STAY as they are: un-ending them would silently re-grant
-- authority a revocation removed. The owner decides any reversal per
-- organization.
-- ============================================================================

begin;

create or replace function public.membership_revoke_v1(p_membership_id uuid)
returns text
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

create or replace function public.membership_leave_v1(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
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

create or replace function public.mirror_company_to_org()
returns trigger language plpgsql security definer set search_path = public as $$
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
      owner_profile_id = new.profile_id, legal_name = new.legal_name,
      display_name = new.display_name, country = new.country,
      vat_number = new.vat_number, website = new.website,
      description = new.description, trust_score = new.trust_score,
      updated_at = now()
    where legacy_company_id = new.id;
  end if;
  return new;
end $$;

create or replace function public.mirror_agency_to_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.organizations
      (owner_profile_id, organization_type, legal_name, country, description, legacy_agency_id)
    values
      (new.profile_id, 'agency', new.legal_name, new.country, new.description, new.id);
  elsif (tg_op = 'UPDATE') then
    update public.organizations set
      owner_profile_id = new.profile_id, legal_name = new.legal_name,
      country = new.country, description = new.description, updated_at = now()
    where legacy_agency_id = new.id;
  end if;
  return new;
end $$;

revoke all on function public.mirror_company_to_org() from public;
revoke all on function public.mirror_company_to_org() from anon;
revoke all on function public.mirror_company_to_org() from authenticated;
revoke all on function public.mirror_agency_to_org() from public;
revoke all on function public.mirror_agency_to_org() from anon;
revoke all on function public.mirror_agency_to_org() from authenticated;

create or replace function public.owns_company(c uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.companies x where x.id = c and x.profile_id = auth.uid()
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

drop function if exists public.membership_close_governance_v1(uuid, uuid, uuid, text);

commit;
