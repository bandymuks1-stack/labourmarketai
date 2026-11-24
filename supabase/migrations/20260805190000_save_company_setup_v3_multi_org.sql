-- 20260805190000 — explicit create/edit company path (M-P0-2)
--
-- @human-gate-approved — RED class: SECURITY DEFINER function creation +
-- redefinition, EXECUTE grant changes, and scanner-visible DML text inside
-- the plpgsql bodies (apply time itself runs NO DML). OWNER APPROVAL
-- recorded 2026-08-05 ("OWNER DECISION — APPLY AND MERGE M-P0-2" §1),
-- bound to the reviewed HEAD's migration bytes; decision recorded in
-- docs/architecture/MULTI_ORGANIZATION_STRUCTURAL_TRAIN.md.
-- Named findings the approval covers, still visible as notices:
--   * security-definer-function — v3 created, v1/v2 redefined (all keep
--     `set search_path = public`, auth.uid() authority checks);
--   * grant-or-revoke — EXECUTE revoked from public/anon, granted to
--     authenticated only, for all three functions;
--   * data-dml — UPDATE/INSERT statements INSIDE the function bodies
--     (runtime paths); the migration itself mutates zero rows.
--
-- SAFETY CLASS: RED. Creates one SECURITY DEFINER function and REDEFINES an
-- existing one (save_company_setup_v2) — human-gate classes (g)/(h).
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- v2 (20260612090000) is a singleton upsert: `update public.companies …
-- where profile_id = uid`. With M-P0-1 applied (the one-person-one-company
-- cap is gone, prod ledger 20260805171825) that shape is actively dangerous:
--   * "create organization B" would RENAME organization A in place;
--   * once a profile owns two rows, `select … where profile_id = uid into`
--     silently reads whichever row the planner returns first — the exact
--     "first company fallback" the doctrine forbids.
--
-- ── WHAT THIS ADDS ─────────────────────────────────────────────────────────
-- `save_company_setup_v3(p_company_id, …)`:
--   * p_company_id NULL  → CREATE: INSERT-only, never touches another row.
--     A duplicate canonical name by the same creator surfaces as
--     'duplicate_company' (the M-P0-1 key raises unique_violation).
--   * p_company_id set   → EDIT exactly that row, guarded
--     `id = p_company_id AND profile_id = uid`. A forged, foreign or dead id
--     raises 'not_owner' (42501) with no existence oracle. No fallback row
--     is ever chosen for the caller.
--   The ownership truth used here is still the CREATOR check — deliberately,
--   because company_memberships (M-P0-4) does not exist yet. When it lands,
--   this guard widens to membership authority in its own reviewed migration.
--
-- `save_company_setup_v2` is HARDENED, not removed: while the caller owns
-- 0 or 1 companies it behaves exactly as before (old clients keep working);
-- the moment the caller owns 2+ it raises 'multiple_companies' (22023)
-- instead of silently acting on an arbitrary row. v1 already delegates its
-- semantics through the same singleton path and inherits the same guard by
-- calling v2? — NO: v1 (20260604140000) has its own body; it predates
-- company_type. It keeps its behaviour for 0/1 companies because its own
-- `where profile_id = uid` UPDATE updates ALL owned rows otherwise — so v1
-- gets the same multiplicity guard here for the same reason.
--
-- NO DML at apply time. No table/policy/RLS/grant change beyond the three
-- function definitions and their EXECUTE grants (authenticated only).
--
-- ROLLBACK: supabase/rollbacks/20260805190000_save_company_setup_v3_multi_org.down.sql
-- drops v3 and restores v1/v2 bodies verbatim from 20260604140000 /
-- 20260612090000 (re-opening the singleton behaviour, documented there).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Safety assertions ──────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'companies_profile_id_key'
       and conrelid = 'public.companies'::regclass
  ) then
    raise exception
      'companies_profile_id_key still present — apply M-P0-1 (20260805170000) BEFORE this migration';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'companies_creator_canonical_name_key'
  ) then
    raise exception
      'companies_creator_canonical_name_key missing — M-P0-1 replacement key expected; review 20260805190000';
  end if;
end $$;

-- ── 2. v3 — explicit create / explicit edit ───────────────────────────────
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

-- ── 3. Multiplicity guard for the legacy singleton RPCs ───────────────────
-- v2 keeps its exact pre-M-P0-1 behaviour for 0/1 owned companies and fails
-- closed (multiple_companies) for 2+. Implemented as a thin guard prologue +
-- delegation to v3 so there is ONE write path:
--   * 0 companies → v3 CREATE (same as v2's insert branch);
--   * 1 company   → v3 EDIT of that single unambiguous row (same as v2's
--     update branch);
--   * 2+          → 'multiple_companies' (22023) — the caller must use v3
--     with an explicit id. No planner-ordered row is ever picked.
-- Signature (names, order, defaults) EXACTLY as 20260612090000 defined it —
-- CREATE OR REPLACE must match the existing function or it creates a second
-- overload / fails on default removal.
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
  uid        uuid := auth.uid();
  owned      uuid[];
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select coalesce(array_agg(id), '{}') into owned
    from public.companies where profile_id = uid;

  if array_length(owned, 1) is not null and array_length(owned, 1) > 1 then
    raise exception 'multiple_companies' using errcode = '22023';
  end if;

  return public.save_company_setup_v3(
    case when array_length(owned, 1) = 1 then owned[1] else null end,
    p_legal_name, p_country, p_registration_code, p_address, p_website,
    p_contact_email, p_contact_phone, p_requester_role, p_submit,
    p_company_type
  );
end $$;

comment on function public.save_company_setup_v2(text, text, text, text, text, text, text, text, text, boolean) is
  'LEGACY singleton entry, hardened by M-P0-2: unchanged behaviour for 0/1 '
  'owned companies (delegates to v3), fails closed with multiple_companies '
  'for 2+ — never picks a planner-ordered row.';

revoke all on function public.save_company_setup_v2(text, text, text, text, text, text, text, text, text, boolean) from public;
revoke all on function public.save_company_setup_v2(text, text, text, text, text, text, text, text, text, boolean) from anon;
grant execute on function public.save_company_setup_v2(text, text, text, text, text, text, text, text, text, boolean) to authenticated;

-- v1 (20260604140000, no company_type param) gets the identical guard and
-- delegation for the identical reason.
-- Signature (names, order, defaults) EXACTLY as 20260604140000 defined it.
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
  uid   uuid := auth.uid();
  owned uuid[];
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select coalesce(array_agg(id), '{}') into owned
    from public.companies where profile_id = uid;

  if array_length(owned, 1) is not null and array_length(owned, 1) > 1 then
    raise exception 'multiple_companies' using errcode = '22023';
  end if;

  return public.save_company_setup_v3(
    case when array_length(owned, 1) = 1 then owned[1] else null end,
    p_legal_name, p_country, p_registration_code, p_address, p_website,
    p_contact_email, p_contact_phone, p_requester_role, p_submit,
    null
  );
end $$;

comment on function public.save_company_setup(text, text, text, text, text, text, text, text, boolean) is
  'LEGACY v1 singleton entry, hardened by M-P0-2: delegates to v3 for 0/1 '
  'owned companies, fails closed with multiple_companies for 2+.';

revoke all on function public.save_company_setup(text, text, text, text, text, text, text, text, boolean) from public;
revoke all on function public.save_company_setup(text, text, text, text, text, text, text, text, boolean) from anon;
grant execute on function public.save_company_setup(text, text, text, text, text, text, text, text, boolean) to authenticated;
