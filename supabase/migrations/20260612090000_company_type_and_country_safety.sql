-- 20260612090000_company_type_and_country_safety.sql
--
-- Company role simplicity v1 (owner smoke fixes):
--
--   A. company_type — the company PROFILE now carries the kind of organisation
--      it is. "Agency" stops being a separate root user role going forward:
--      a staffing agency is a COMPANY whose company_type = 'staffing_agency'.
--      One canonical company profile; changing the type never moves the user
--      to a different/legacy profile mode. Allowed values (LT labels in UI):
--        construction      — statybos įmonė
--        staffing_agency   — personalo agentūra
--        subcontractor     — subrangovas
--        manufacturing     — gamyba
--        services          — paslaugos
--        client_customer   — klientas / užsakovas
--        other             — kita
--
--   B. save_company_setup_v2 — additive RPC (the 20260604140000 automatic-first
--      version is kept untouched for back-compat) that also:
--        * persists p_company_type (allowlisted, else errcode 22023
--          'invalid_company_type');
--        * VALIDATES p_country against public.countries BEFORE writing. The
--          owner smoke surfaced a raw Postgres failure: companies.country is
--          free text, but the mirror trigger (0013 mirror_company_to_org)
--          copies it into organizations.country which has a FOREIGN KEY to
--          countries(code) — so typing "Lietuva" blew up with the technical
--          organizations_country_fkey violation AFTER the form looked valid.
--          v2 normalises the code (upper/trim) and raises errcode 22023
--          'invalid_country' early, which the app layer maps to a calm,
--          human Lithuanian message. The FK can no longer be reached with an
--          invalid value through this path.
--      Status ladder behaviour is IDENTICAL to 20260604140000 (automatic-first,
--      never fabricates 'verified'; p_submit only escalates to
--      pending_verification). The 20260604120000 verification guard trigger is
--      untouched.
--
-- Additive only: no drops of tables/columns/functions, no RLS changes, no
-- table grants. The app calls v2 and falls back to v1 when v2 is absent
-- (42883), so deploys are safe in either order.
--
-- ROLLBACK (run manually only if reverting):
--   -- drop function if exists public.save_company_setup_v2(text,text,text,text,text,text,text,text,text,boolean);
--   -- alter table public.companies drop constraint if exists companies_company_type_check;
--   -- alter table public.companies drop column if exists company_type;

-- ── 1. company_type column (additive, defaulted, allowlisted) ─────────
alter table public.companies
  add column if not exists company_type text not null default 'other';

alter table public.companies
  drop constraint if exists companies_company_type_check;
alter table public.companies
  add constraint companies_company_type_check
  check (company_type in (
    'construction','staffing_agency','subcontractor',
    'manufacturing','services','client_customer','other'
  ));

-- ── 2. v2 setup RPC: company_type + validated country ─────────────────
create or replace function public.save_company_setup_v2(
  p_legal_name        text,
  p_company_type      text default null,
  p_country           text default null,
  p_registration_code text default null,
  p_address           text default null,
  p_website           text default null,
  p_contact_email     text default null,
  p_contact_phone     text default null,
  p_requester_role    text default null,
  p_submit            boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid            uuid := auth.uid();
  company_uuid   uuid;
  cleaned_name   text := nullif(trim(coalesce(p_legal_name, '')), '');
  c_type         text := lower(nullif(trim(coalesce(p_company_type, '')), ''));
  c_country      text := upper(nullif(trim(coalesce(p_country, '')), ''));
  c_email        text := nullif(trim(coalesce(p_contact_email, '')), '');
  c_website      text := nullif(trim(coalesce(p_website, '')), '');
  c_regcode      text := nullif(trim(coalesce(p_registration_code, '')), '');
  existing_country text;
  effective_country text;
  current_status text;
  automated      text;
  next_status    text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if cleaned_name is null then
    raise exception 'Company legal name is required' using errcode = '22023';
  end if;

  -- Company type must come from the allowlist (the UI sends only these).
  if c_type is not null and c_type not in (
    'construction','staffing_agency','subcontractor',
    'manufacturing','services','client_customer','other'
  ) then
    raise exception 'invalid_company_type' using errcode = '22023';
  end if;

  -- Country must be a known countries.code (the UI sends a select value).
  -- This is what prevents the organizations_country_fkey mirror failure from
  -- ever surfacing as a raw technical error to the user.
  if c_country is not null and not exists (
    select 1 from public.countries where code = c_country
  ) then
    raise exception 'invalid_country' using errcode = '22023';
  end if;

  insert into public.profile_roles (profile_id, role, is_active, role_data)
  values (uid, 'company', true, '{}'::jsonb)
  on conflict (profile_id, role) do update
     set is_active = true;

  select verification_status, country
    into current_status, existing_country
    from public.companies
   where profile_id = uid;

  -- AUTOMATED basic checks (same honest shape checks as 20260604140000),
  -- evaluated against the EFFECTIVE country (new value or the kept one).
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

  if current_status is not null or exists (
    select 1 from public.companies where profile_id = uid
  ) then
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
    where profile_id = uid
    returning id into company_uuid;
  else
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
  end if;

  return company_uuid;
end $$;

revoke all on function public.save_company_setup_v2(text, text, text, text, text, text, text, text, text, boolean) from public;
grant execute on function public.save_company_setup_v2(text, text, text, text, text, text, text, text, text, boolean) to authenticated;
