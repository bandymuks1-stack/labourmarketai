-- ROLLBACK for 20260806180000_membership_authority_widening_v1.sql
--
-- Restores BOTH pre-widening definitions verbatim:
--   * manages_organization — 0013_work_journal_m1.sql (engagement arm only);
--   * save_company_setup_v3 — 20260805190000 (creator-only edit guard).
-- Grants restated exactly as 20260722160000 / 20260805190000 left them.
-- No table, row or policy is touched. NOTE: rolling back removes membership
-- owners'/admins' management + edit authority again — safe while those
-- roles' only holders are the creator backfill (creator arm still carries
-- them); once real non-creator members exist, prefer a forward fix.

create or replace function public.manages_organization(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = auth.uid()
       and ec.organization_id = org
       and ec.status = 'active'
       and ec.relationship_slug in ('manager','owner','external_manager')
  )
$$;
revoke all on function public.manages_organization(uuid) from public;
revoke all on function public.manages_organization(uuid) from anon;
grant execute on function public.manages_organization(uuid) to authenticated;

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
    -- EDIT: exactly the named row, and only if the caller created it.
    -- Same error for "not yours" and "does not exist" — no existence oracle.
    select verification_status, country
      into current_status, existing_country
      from public.companies
     where id = p_company_id and profile_id = uid;
    if not found then
      raise exception 'not_owner' using errcode = '42501';
    end if;
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
    where id = p_company_id and profile_id = uid
    returning id into company_uuid;
    if company_uuid is null then
      -- The row vanished between the SELECT and the UPDATE — fail closed.
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

comment on function public.save_company_setup_v3(uuid, text, text, text, text, text, text, text, text, boolean, text) is
  'M-P0-2 explicit company create/edit. p_company_id NULL = INSERT-only '
  'create (duplicate canonical name -> duplicate_company); p_company_id set '
  '= edit exactly that row, creator-guarded (not_owner otherwise, no '
  'existence oracle). Never chooses a fallback row. Ownership check widens '
  'to company_memberships in M-P0-4.';

revoke all on function public.save_company_setup_v3(uuid, text, text, text, text, text, text, text, text, boolean, text) from public;
revoke all on function public.save_company_setup_v3(uuid, text, text, text, text, text, text, text, text, boolean, text) from anon;
grant execute on function public.save_company_setup_v3(uuid, text, text, text, text, text, text, text, text, boolean, text) to authenticated;
