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


-- review of #2607: restore the creator gates exactly as before
create or replace function public.owns_agency(a uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.agencies x where x.id = a and x.profile_id = auth.uid()
  )
$function$;
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
           c.profile_id = uid
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
        profile_id = uid
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

drop function if exists public.company_creator_governance_ended_v1(uuid);
drop function if exists public.agency_creator_governance_ended_v1(uuid);
drop function if exists public.creator_governance_ended_v1(uuid);

commit;
