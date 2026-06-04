-- 20260604140000_company_automatic_first.sql
--
-- CORRECTION: company onboarding is AUTOMATIC-FIRST, not admin-approval-first.
--
-- Before (20260604120000): a company setup defaulted to 'draft' and the
-- primary action moved it to 'pending_verification' — framing company use as
-- "request, then wait for an admin". That is the wrong product model.
--
-- After (this migration): creating/saving a company profile makes it usable
-- immediately. The persisted status is derived from AUTOMATED checks:
--   * 'active_unverified' — required basics present + provided fields well-formed;
--     the company is usable now, just not identity/registry-verified.
--   * 'needs_checks'      — a basic automated check failed (missing country, or
--     a provided email / website / registration code is malformed); still
--     usable, flagged so the user can fix it.
-- Manual review is now an EXCEPTION/escalation, never the default gate:
--   * 'pending_verification' is set ONLY when the user explicitly escalates
--     (p_submit = true) — an optional "request manual review", not required.
--   * 'verified' remains a STRONGER trust state set only by an admin / a real
--     registry path (no fake registry verification here).
--
-- Additive + reversible:
--   1. widen the verification_status CHECK to add 'active_unverified' +
--      'needs_checks' (keeps all prior values for back-compat / escalation);
--   2. set the column DEFAULT to 'active_unverified' (a bare add_role company
--      is usable immediately);
--   3. backfill existing 'draft' rows → 'active_unverified' (drafts become
--      usable; 'unverified' / 'pending_verification' / 'verified' left as-is);
--   4. CREATE OR REPLACE save_company_setup with automatic status derivation.
-- The 20260604120000 verification guard trigger is UNCHANGED — promotion to
-- 'verified' stays admin-only on every path (active_unverified / needs_checks /
-- pending_verification are not 'verified', so the trigger never blocks them).
--
-- ROLLBACK (run manually only if reverting): restore the prior CHECK + default
-- + the 20260604120000 save_company_setup body. No data is dropped.
--
-- Application status: committed; NOT applied to prod by the agent (owner
-- approval required). Until applied, save_company_setup keeps the prior
-- behaviour — no crash.

-- ── 1. Widen the status ladder ───────────────────────────────────────
alter table public.companies
  drop constraint if exists companies_verification_status_check;
alter table public.companies
  add constraint companies_verification_status_check
  check (verification_status in (
    'draft','active_unverified','needs_checks',
    'pending_verification','unverified','verified'
  ));

-- ── 2. Automatic-first default ───────────────────────────────────────
alter table public.companies
  alter column verification_status set default 'active_unverified';

-- ── 3. Backfill: drafts become usable (active_unverified) ────────────
update public.companies
   set verification_status = 'active_unverified'
 where verification_status = 'draft';

-- ── 4. Automatic-first setup RPC ─────────────────────────────────────
-- Same signature as 20260604120000 (so the app layer is unchanged). The
-- meaning of p_submit changes from "submit a request" to "escalate to manual
-- review" — an OPTIONAL action, not the normal path.
create or replace function public.save_company_setup(
  p_legal_name        text,
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
  c_country      text := nullif(trim(coalesce(p_country, '')), '');
  c_email        text := nullif(trim(coalesce(p_contact_email, '')), '');
  c_website      text := nullif(trim(coalesce(p_website, '')), '');
  c_regcode      text := nullif(trim(coalesce(p_registration_code, '')), '');
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

  insert into public.profile_roles (profile_id, role, is_active, role_data)
  values (uid, 'company', true, '{}'::jsonb)
  on conflict (profile_id, role) do update
     set is_active = true;

  -- AUTOMATED basic checks. No fake registry lookup — only shape/presence of
  -- what the user provided. Any failure → 'needs_checks' (still usable).
  automated := case
    when c_country is null then 'needs_checks'
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

  select verification_status into current_status
    from public.companies
   where profile_id = uid;

  if current_status = 'verified' then
    next_status := 'verified';                  -- stays verified (admin set it)
  elsif p_submit then
    next_status := 'pending_verification';       -- OPTIONAL manual-review escalation
  else
    next_status := automated;                    -- automatic-first default
  end if;

  if exists (select 1 from public.companies where profile_id = uid) then
    update public.companies set
      legal_name          = cleaned_name,
      display_name        = cleaned_name,
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
      profile_id, legal_name, display_name, country,
      registration_code, address, website, contact_email, contact_phone,
      requester_role, verification_status, requested_at
    ) values (
      uid, cleaned_name, cleaned_name, c_country,
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

revoke all on function public.save_company_setup(text, text, text, text, text, text, text, text, boolean) from public;
grant execute on function public.save_company_setup(text, text, text, text, text, text, text, text, boolean) to authenticated;
