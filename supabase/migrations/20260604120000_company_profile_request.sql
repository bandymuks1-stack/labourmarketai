-- 20260604120000_company_profile_request.sql
--
-- Company profile REQUEST flow (not unrestricted "verified company creation").
--
-- Problem this closes:
--   The company role had a one-field setup (`name` only) and the row was
--   immediately "live" with no verification state. A user could not record
--   the real details of their organisation (registration code, address,
--   website, contact, their own role in the company), and nothing marked the
--   company as unverified. That let an account look like a fully trusted
--   company with zero checks — a fake-trust footgun (PLATFORM_DOCTRINE §7).
--
-- What this migration adds (ADDITIVE ONLY — no drops, no data loss):
--   1. New nullable columns on public.companies for the richer request:
--        registration_code, address, contact_email, contact_phone,
--        requester_role  (the user's role inside the company), and
--        verification_status + verification_note + requested_at.
--   2. A CHECK on verification_status restricted to a 4-state honest ladder:
--        'draft' | 'pending_verification' | 'unverified' | 'verified'
--      Default 'draft'. Existing rows are backfilled to 'unverified' so a
--      pre-existing company is never silently shown as verified.
--   3. save_company_setup() — a SECURITY DEFINER upsert RPC (mirrors
--      save_customer_setup from 0026). It NEVER sets 'verified'. It can only
--      move a company to 'pending_verification' (submit) or keep 'draft'.
--   4. enforce_company_verification_guard() + a BEFORE INSERT/UPDATE trigger:
--      defense-in-depth so that promoting a company to 'verified' is admin-only
--      on EVERY write path (direct table write or any RPC), independent of
--      table grants. The self-service RPC never promotes, so the trigger never
--      blocks it.
--
-- Access model (verified intentionally NOT reachable by normal users):
--   * `authenticated` has only SELECT on public.companies (0023); there is NO
--     table-level INSERT/UPDATE grant, so the ONLY write path is the
--     SECURITY DEFINER RPC, which writes WHERE profile_id = auth.uid() and can
--     never set 'verified'. A user can therefore only create / update THEIR
--     OWN company request, never another user's, and never self-verify.
--   * The trigger is belt-and-braces if a future migration ever adds a direct
--     UPDATE grant.
--
-- Reversibility (PLATFORM_DOCTRINE §16):
--   The base companies table (0001) and add_role()/complete_onboarding() RPCs
--   are not touched, so existing flows keep working with or without this
--   migration. ROLLBACK (run manually only if reverting):
--     drop trigger if exists trg_company_verification_guard on public.companies;
--     drop function if exists public.enforce_company_verification_guard();
--     drop function if exists public.save_company_setup(text,text,text,text,text,text,text,text,boolean);
--     alter table public.companies drop constraint if exists companies_verification_status_check;
--     alter table public.companies drop constraint if exists companies_profile_id_key;
--     alter table public.companies
--       drop column if exists registration_code,
--       drop column if exists address,
--       drop column if exists contact_email,
--       drop column if exists contact_phone,
--       drop column if exists requester_role,
--       drop column if exists verification_status,
--       drop column if exists verification_note,
--       drop column if exists requested_at;
--
-- Application status:
--   Migration file COMMITTED. Owner applies it manually (Supabase SQL editor
--   or MCP apply_migration). Until then, /dashboard/start/company renders an
--   explicit "feature not ready yet" blocker (undefined_column / undefined
--   function are caught by the lib layer) — no crash, no fake success.

-- ── 1. Columns ───────────────────────────────────────────────────────
alter table public.companies
  add column if not exists registration_code  text,
  add column if not exists address            text,
  add column if not exists contact_email      text,
  add column if not exists contact_phone      text,
  add column if not exists requester_role     text,
  add column if not exists verification_note  text,
  add column if not exists requested_at       timestamptz;

-- verification_status with an honest 4-state ladder. Add the column first
-- (default draft for new rows), then backfill existing rows to 'unverified'
-- so legacy companies are never silently presented as verified.
alter table public.companies
  add column if not exists verification_status text not null default 'draft';

update public.companies
   set verification_status = 'unverified'
 where verification_status = 'draft'
   and created_at < now() - interval '1 second';

-- Drop + recreate the CHECK so re-running the migration is safe.
alter table public.companies
  drop constraint if exists companies_verification_status_check;
alter table public.companies
  add constraint companies_verification_status_check
  check (verification_status in (
    'draft','pending_verification','unverified','verified'
  ));

-- ── 2. Setup RPC ─────────────────────────────────────────────────────
-- save_company_setup is the one-shot upsert used by the company setup form.
-- It (a) creates the company row if absent, (b) updates it if present, and
-- (c) ensures the user holds the 'company' role via profile_roles.
--
-- It branches on existence (NOT `on conflict`) so it does not depend on a
-- unique constraint that could fail to apply on a table with legacy duplicate
-- rows.
--
-- HONESTY GUARANTEE: this RPC can NEVER set verification_status = 'verified'.
-- When p_submit is true it moves the company to 'pending_verification'
-- (a request awaiting human review). Otherwise it keeps/sets 'draft'. A
-- company that is already 'verified' is left verified (an admin verified it;
-- this self-service path can only request).
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
  current_status text;
  next_status    text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if cleaned_name is null then
    raise exception 'Company legal name is required' using errcode = '22023';
  end if;

  -- ensure profile_roles has company (additive; never removes other roles)
  insert into public.profile_roles (profile_id, role, is_active, role_data)
  values (uid, 'company', true, '{}'::jsonb)
  on conflict (profile_id, role) do update
     set is_active = true;

  -- Determine the next verification status WITHOUT ever fabricating
  -- 'verified'. Read the existing status first.
  select verification_status into current_status
    from public.companies
   where profile_id = uid;

  if current_status = 'verified' then
    next_status := 'verified';        -- stays verified; never re-requested here
  elsif p_submit then
    next_status := 'pending_verification';
  else
    next_status := 'draft';
  end if;

  if exists (select 1 from public.companies where profile_id = uid) then
    update public.companies set
      legal_name          = cleaned_name,
      display_name        = cleaned_name,
      country             = coalesce(nullif(trim(coalesce(p_country, '')), ''), country),
      registration_code   = coalesce(nullif(trim(coalesce(p_registration_code, '')), ''), registration_code),
      address             = coalesce(nullif(trim(coalesce(p_address, '')), ''), address),
      website             = coalesce(nullif(trim(coalesce(p_website, '')), ''), website),
      contact_email       = coalesce(nullif(trim(coalesce(p_contact_email, '')), ''), contact_email),
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
      uid,
      cleaned_name,
      cleaned_name,
      nullif(trim(coalesce(p_country, '')), ''),
      nullif(trim(coalesce(p_registration_code, '')), ''),
      nullif(trim(coalesce(p_address, '')), ''),
      nullif(trim(coalesce(p_website, '')), ''),
      nullif(trim(coalesce(p_contact_email, '')), ''),
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

-- ── 3. Verification guard (defense-in-depth) ─────────────────────────
-- Only an admin may promote a company to 'verified', on ANY write path.
-- auth.uid() / is_admin() reflect the END user even inside a SECURITY DEFINER
-- RPC (the JWT GUC is preserved), so a non-admin calling save_company_setup can
-- only request. The RPC keeps an already-verified row verified (NEW = OLD), so
-- this trigger never blocks the legitimate flow.
create or replace function public.enforce_company_verification_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verification_status = 'verified'
     and (tg_op = 'INSERT' or old.verification_status is distinct from 'verified')
     and not public.is_admin() then
    raise exception 'Only an admin can mark a company verified'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_company_verification_guard on public.companies;
create trigger trg_company_verification_guard
  before insert or update on public.companies
  for each row execute function public.enforce_company_verification_guard();

-- ── 4. Optional hygiene: one company per profile ─────────────────────
-- A profile owns at most one company row (1:1, per project model). The RPC no
-- longer depends on this, so it is added only when it can be added safely (no
-- pre-existing duplicates) — apply never fails on legacy data.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'companies_profile_id_key'
  ) and not exists (
    select 1 from public.companies
     where profile_id is not null
     group by profile_id
    having count(*) > 1
  ) then
    alter table public.companies
      add constraint companies_profile_id_key unique (profile_id);
  end if;
end $$;
