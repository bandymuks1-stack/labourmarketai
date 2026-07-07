-- 20260707120000_company_need_public_intake.sql
--
-- Anonymous structured demand intake v1. The public /company-need route
-- (PR #675/#677) lets an anonymous employer PREPARE a structured need but,
-- until now, persisted NOTHING unless they created an account first. This
-- migration closes that launch gap in the smallest safe way:
--
--   * a DEDICATED, write-only public intake table
--     public.company_need_public_intakes (NOT customer_requests — the
--     authenticated demand path stays untouched and un-weakened); and
--   * ONE new-name SECURITY DEFINER RPC, submit_company_need_public_v1,
--     that VALIDATES the payload (closed enum sets, length caps, the
--     PR #675 10-market country list) and INSERTs a single status='new'
--     row. This RPC is the ONLY anon write path.
--
-- SECURITY MODEL (safe-by-default):
--   * RLS is ENABLED on the table with NO policies at all → the `anon` and
--     `authenticated` roles get deny-all for direct SELECT / INSERT /
--     UPDATE / DELETE. Anonymous (or ordinary logged-in) users can never
--     read, list, update, delete, or infer other submitted rows.
--   * The SECURITY DEFINER function runs as its owner (the table owner),
--     which bypasses RLS for the single guarded INSERT — the standard
--     intake pattern of submit_help_request_v1 (20260705260000) and
--     submit_privacy_request_v1 (20260706150000).
--   * Internal/admin visibility stays on the EXISTING service-role path
--     (createAdminClient, which bypasses RLS) — no authenticated read
--     policy is added, so a normal signed-in user cannot read the queue.
--
-- INTERNAL ONLY — BY CONSTRUCTION: inserting a row sends NOTHING anywhere
-- (no email, no SMS, no push, no Telegram, no webhook, no outbound call).
-- A human operator reviews the row on the existing internal path. Nothing
-- here claims any automated follow-up.
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   * NO change to customer_requests or any existing table / policy /
--     grant / constraint / trigger / RPC (new-name objects only);
--   * NO anon or authenticated SELECT/UPDATE/DELETE policy on the new
--     table (write-only-via-RPC by construction);
--   * NO destructive statement, NO data DML, NO payment machinery.
--
-- HUMAN GATE: this migration is RED-class by the migration-safety gate
-- (SECURITY DEFINER + GRANT to anon). It is intentionally NOT annotated
-- `@human-gate-approved` here because owner review has not happened yet —
-- the PR is opened as a DRAFT for explicit owner human-gate approval and
-- manual Supabase-MCP apply (never db push). Until applied, the app
-- degrades honestly: the submit action sees 42883 (undefined function) /
-- 42P01 (undefined table) and falls back to the honest "prepared — create
-- an account to submit" state (no dead-end, no false success).
--
-- ROLLBACK: supabase/rollbacks/20260707120000_company_need_public_intake.down.sql
-- (drops ONLY the one NEW function and the one NEW table; there is no
-- existing object to restore).

begin;

create table if not exists public.company_need_public_intakes (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  locale           text,
  company_name     text not null,
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  country          text not null,
  city_or_region   text,
  sector           text,
  headcount        integer,
  start_window     text,
  expected_duration text,
  urgency          text,
  accommodation    text,
  transport_needed boolean,
  languages        text,
  engagement_type  text,
  description      text not null,
  source_path      text,
  status           text not null default 'new'
);

comment on table public.company_need_public_intakes is
  'Anonymous structured company-demand intake (v1). Write-only from the public path via submit_company_need_public_v1; read only via service-role. No anon/authenticated RLS policies by design.';

-- RLS on, NO policies → deny-all for anon + authenticated direct access.
-- service_role bypasses RLS for the internal review read; the SECURITY
-- DEFINER RPC below (owner-run) is the only write path.
alter table public.company_need_public_intakes enable row level security;

create or replace function public.submit_company_need_public_v1(
  p_locale           text,
  p_company_name     text,
  p_contact_name     text default null,
  p_contact_email    text default null,
  p_contact_phone    text default null,
  p_country          text default null,
  p_city_region      text default null,
  p_sector           text default null,
  p_headcount        integer default 1,
  p_start_window     text default null,
  p_expected_duration text default null,
  p_urgency          text default null,
  p_accommodation    text default null,
  p_transport_needed boolean default false,
  p_languages        text default null,
  p_engagement_type  text default null,
  p_description      text default null,
  p_source_path      text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company text := nullif(btrim(coalesce(p_company_name, '')), '');
  v_desc    text := nullif(btrim(coalesce(p_description, '')), '');
  v_country text := upper(nullif(btrim(coalesce(p_country, '')), ''));
  v_email   text := nullif(btrim(coalesce(p_contact_email, '')), '');
  v_locale  text := lower(coalesce(nullif(btrim(coalesce(p_locale, '')), ''), 'lt'));
  v_head    integer := coalesce(p_headcount, 1);
  v_urgency text := lower(coalesce(nullif(btrim(coalesce(p_urgency, '')), ''), 'flexible'));
  v_acc     text := lower(coalesce(nullif(btrim(coalesce(p_accommodation, '')), ''), 'not_provided'));
  v_eng     text := lower(coalesce(nullif(btrim(coalesce(p_engagement_type, '')), ''), 'employment'));
  v_id      uuid;
begin
  -- Required, bounded fields.
  if v_company is null or char_length(v_company) > 200 then
    raise exception 'invalid_company_name' using errcode = '22023';
  end if;
  if v_desc is null or char_length(v_desc) > 8000 then
    raise exception 'invalid_description' using errcode = '22023';
  end if;

  -- Country constrained to the PR #675 10-market target list (mirrors
  -- READINESS_COUNTRIES in apps/web/lib/country-readiness/types.ts).
  if v_country is null
     or v_country !~ '^[A-Z]{2}$'
     or v_country not in ('LT','LV','EE','PL','DE','NL','DK','NO','SE','FI') then
    raise exception 'invalid_country' using errcode = '22023';
  end if;

  -- Closed enum sets — anything else normalises to the safe default.
  if v_urgency not in ('asap','weeks','flexible') then v_urgency := 'flexible'; end if;
  if v_acc not in ('provided_free','provided_paid','provided_deducted','not_provided') then
    v_acc := 'not_provided';
  end if;
  if v_eng not in ('employment','subcontracting','agency_supply') then v_eng := 'employment'; end if;
  if v_locale not in ('lt','en','ru') then v_locale := 'lt'; end if;

  -- Clamp headcount to a sane range.
  if v_head < 1 then v_head := 1; end if;
  if v_head > 100000 then v_head := 100000; end if;

  -- Light optional-field validation (avoid junk, avoid over-collection).
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if p_contact_name    is not null and char_length(p_contact_name)    > 160  then raise exception 'contact_name_too_long'    using errcode = '22023'; end if;
  if p_contact_phone   is not null and char_length(p_contact_phone)   > 40   then raise exception 'contact_phone_too_long'   using errcode = '22023'; end if;
  if p_city_region     is not null and char_length(p_city_region)     > 160  then raise exception 'city_region_too_long'     using errcode = '22023'; end if;
  if p_sector          is not null and char_length(p_sector)          > 200  then raise exception 'sector_too_long'          using errcode = '22023'; end if;
  if p_start_window    is not null and char_length(p_start_window)    > 40   then raise exception 'start_window_too_long'    using errcode = '22023'; end if;
  if p_expected_duration is not null and char_length(p_expected_duration) > 120 then raise exception 'duration_too_long'     using errcode = '22023'; end if;
  if p_languages       is not null and char_length(p_languages)       > 200  then raise exception 'languages_too_long'       using errcode = '22023'; end if;
  if p_source_path     is not null and char_length(p_source_path)     > 200  then raise exception 'source_path_too_long'     using errcode = '22023'; end if;

  insert into public.company_need_public_intakes (
    locale, company_name, contact_name, contact_email, contact_phone,
    country, city_or_region, sector, headcount, start_window,
    expected_duration, urgency, accommodation, transport_needed,
    languages, engagement_type, description, source_path, status
  ) values (
    v_locale, v_company,
    nullif(btrim(coalesce(p_contact_name, '')), ''),
    v_email,
    nullif(btrim(coalesce(p_contact_phone, '')), ''),
    v_country,
    nullif(btrim(coalesce(p_city_region, '')), ''),
    nullif(btrim(coalesce(p_sector, '')), ''),
    v_head,
    nullif(btrim(coalesce(p_start_window, '')), ''),
    nullif(btrim(coalesce(p_expected_duration, '')), ''),
    v_urgency, v_acc,
    coalesce(p_transport_needed, false),
    nullif(btrim(coalesce(p_languages, '')), ''),
    v_eng, v_desc,
    nullif(btrim(coalesce(p_source_path, '')), ''),
    'new'
  )
  returning id into v_id;

  return v_id;
end $$;

-- Only the guarded RPC is exposed. The public (anon) and authenticated
-- roles get EXECUTE on the function and nothing on the table itself.
revoke all on function
  public.submit_company_need_public_v1(
    text, text, text, text, text, text, text, text, integer, text,
    text, text, text, boolean, text, text, text, text
  ) from public;
grant execute on function
  public.submit_company_need_public_v1(
    text, text, text, text, text, text, text, text, integer, text,
    text, text, text, boolean, text, text, text, text
  ) to anon, authenticated;

commit;
