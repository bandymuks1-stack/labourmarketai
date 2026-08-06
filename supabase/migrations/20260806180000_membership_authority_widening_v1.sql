-- 20260806180000 — membership authority widening v1 (M-P0-4 consumer slice, DB side)
--
-- @human-gate-approved — RED class. OWNER APPROVAL recorded 2026-08-06
-- ("CLOSE MULTI-ORGANIZATION STRUCTURAL TRAIN" §1/§3): apply this exact
-- migration, merge PR #1028 after production proof, normal deployment.
-- Covered findings, still visible as notices: security-definer-function,
-- grant-or-revoke, data-dml (statement text inside the reviewed function
-- body ONLY — apply-time business-row mutation is zero, verified).
-- Executable SQL byte-identical to reviewed HEAD `47c7d818`
-- (comment-stripped sha256
-- 4f2650af185a3cceed7eddcc759ad913b1c01fc302b4084aa10a380a820e4af9).
-- Decision recorded in docs/APPLIED_LEDGER.md.
--
-- SAFETY CLASS: RED. Two SECURITY DEFINER redefinitions + explicit
-- privilege restatement. Built without a marker
-- (CODE_COMPLETE_PENDING_OWNER_GATE); the marker above was added only
-- after the separate 2026-08-06 owner apply decision.
--
-- ── WHAT ───────────────────────────────────────────────────────────────────
-- The §11 consumer doctrine at the DATABASE layer: membership proves the
-- role. Two authority helpers that pre-date `company_memberships` learn the
-- membership arm — the SAME widening pattern the applied 20260806120000 gave
-- `belongs_to_organization()`:
--
--   1. `manages_organization(org)` (0013) — today engagement_contexts only,
--      consumed by ~40 RLS policies and SECURITY DEFINER guards (journals,
--      invitations, team surfaces, assets, experiences, public business
--      profile, membership revocation). An accepted membership
--      owner/admin/manager/external_manager now manages; `member` NEVER
--      (governance ≠ belonging). The engagement arm stays untouched (§13
--      compatibility — legacy manager-class engagements keep working).
--
--   2. `save_company_setup_v3` EDIT guard (20260805190000) — today
--      creator-only (`companies.profile_id = uid`). An ACTIVE owner/admin
--      membership on the organization bound to that company
--      (`organizations.legacy_company_id`) now also edits — matching the
--      app-side `manage-company-profile` capability (owner/admin only;
--      managers run operations, never company identity). The creator arm
--      stays (compatibility data, not sole authority). The CREATE path, the
--      validation, the status machine and the v2 shim are byte-identical.
--
-- Anti-oracle behaviour is preserved: "not yours" and "does not exist"
-- still raise the same `not_owner`.
--
-- ROLLBACK: supabase/rollbacks/20260806180000_membership_authority_widening_v1.down.sql
-- restores BOTH original definitions (0013 manages_organization,
-- 20260805190000 save_company_setup_v3) verbatim, with their grants.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Safety assertions ──────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.company_memberships') is null then
    raise exception 'company_memberships missing — apply 20260806090000 BEFORE this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'manages_organization'
  ) then
    raise exception 'manages_organization missing — 0013 expected before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'save_company_setup_v3'
  ) then
    raise exception 'save_company_setup_v3 missing — 20260805190000 expected before this migration';
  end if;
end $$;

-- ── 1. manages_organization learns the membership arm ─────────────────────
-- Signature (name `org`) EXACTLY as 0013 defined it — CREATE OR REPLACE
-- must match the existing function.
create or replace function public.manages_organization(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = auth.uid()
       and ec.organization_id = org
       and ec.status = 'active'
       and ec.relationship_slug in ('manager','owner','external_manager')
  )
  or exists (
    select 1 from public.company_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = org
       and m.status = 'active'
       and m.role in ('owner','admin','manager','external_manager')
  )
$$;
-- Redefinition post-dates the 20260722160000 closure — the privilege state
-- must be explicit in THIS file (secdef guard): RLS policies evaluate the
-- helper as the querying role, so authenticated keeps EXECUTE; anon/public
-- do not.
revoke all on function public.manages_organization(uuid) from public;
revoke all on function public.manages_organization(uuid) from anon;
grant execute on function public.manages_organization(uuid) to authenticated;

-- ── 2. save_company_setup_v3 — membership owners/admins may EDIT ──────────
-- Body identical to 20260805190000 EXCEPT the two edit-guard predicates
-- (the SELECT guard and the UPDATE's WHERE), each widened with the SAME
-- membership condition. Signature repeated exactly.
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

comment on function public.save_company_setup_v3(uuid, text, text, text, text, text, text, text, text, boolean, text) is
  'M-P0-2 explicit company create/edit. p_company_id NULL = INSERT-only '
  'create (duplicate canonical name -> duplicate_company); p_company_id set '
  '= edit exactly that row, guarded by creator OR active owner/admin '
  'membership on the bound organization (M-P0-4 widening; not_owner '
  'otherwise, no existence oracle). Never chooses a fallback row.';

revoke all on function public.save_company_setup_v3(uuid, text, text, text, text, text, text, text, text, boolean, text) from public;
revoke all on function public.save_company_setup_v3(uuid, text, text, text, text, text, text, text, text, boolean, text) from anon;
grant execute on function public.save_company_setup_v3(uuid, text, text, text, text, text, text, text, text, boolean, text) to authenticated;
