-- @human-gate-approved
-- ============================================================================
-- 20260922130000 — public company-need intake: country = any code in public.countries
--
-- OWNER DIRECTIVE (2026-09-22, "LabourMarket.ai production closure", §3): the
-- 10-country list inside submit_company_need_public_v1 is to be replaced with a
-- global-safe mechanism if it exists only as an old market/product gate, without
-- weakening the SECURITY DEFINER protection.
--
-- WHY THE LIST EXISTED (traced): the function's own comment says
--   "Country constrained to the PR #675 10-market target list (mirrors
--    READINESS_COUNTRIES in apps/web/lib/country-readiness/types.ts)"
-- — a MARKET/PRODUCT list, not an abuse control. Measured side effect: the public
-- form has offered the 17 ACTIVE_MARKETS since 2026-07-17 while the RPC accepted
-- 10, so a company in GE/BE/FR/ES/AT/CH/US was refused with `invalid_country`.
--
-- WHAT CHANGES (one condition): the country must be an ISO-3166-1 alpha-2 code
-- present in public.countries (249 rows since 20260922120000_countries_all_iso_v1,
-- applied 2026-09-22). Registry membership keeps the "closed set, never free
-- text" containment the SECDEF allowlist documents; it is no longer a market list.
-- Every other line is byte-identical to the production definition read on
-- 2026-09-22 (pg_get_functiondef). All abuse bounds of anon_write_bounds_v1
-- (24 h exact-resubmission idempotency, 30/h platform ceiling, 3/24 h per
-- contact e-mail, per-field length ceilings, errcodes 22023 / P0004) are
-- untouched. Ownership, SECURITY DEFINER, search_path and the existing
-- EXECUTE grants are preserved by CREATE OR REPLACE; no grant is changed here.
--
-- ROLLBACK (down): supabase/rollbacks/20260922130000_company_need_intake_country_registry_v1.down.sql
-- restores the 10-code list condition, everything else identical.
-- ============================================================================

create or replace function public.submit_company_need_public_v1(p_locale text, p_company_name text, p_contact_name text default null::text, p_contact_email text default null::text, p_contact_phone text default null::text, p_country text default null::text, p_city_region text default null::text, p_sector text default null::text, p_headcount integer default 1, p_start_window text default null::text, p_expected_duration text default null::text, p_urgency text default null::text, p_accommodation text default null::text, p_transport_needed boolean default false, p_languages text default null::text, p_engagement_type text default null::text, p_description text default null::text, p_source_path text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  v_n       int;
begin
  -- Required, bounded fields.
  if v_company is null or char_length(v_company) > 200 then
    raise exception 'invalid_company_name' using errcode = '22023';
  end if;
  if v_desc is null or char_length(v_desc) > 8000 then
    raise exception 'invalid_description' using errcode = '22023';
  end if;

  -- Country: an ISO-3166-1 alpha-2 code present in the countries registry
  -- (global-access rule 2026-09-22 — a market list orders a select, it never
  -- decides which country a company may be in). Still a closed set, never
  -- free text, so the containment documented in the SECDEF allowlist holds.
  if v_country is null
     or v_country !~ '^[A-Z]{2}$'
     or not exists (select 1 from public.countries c where c.code = v_country) then
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

  -- ── DB-enforced abuse bounds (anon_write_bounds_v1) ─────────────────────
  -- (a) An exact resubmission within 24 h is the same intake: return the
  --     earlier id, write nothing. Idempotent, not a rejection.
  select id into v_id
    from public.company_need_public_intakes
   where created_at > now() - interval '24 hours'
     and lower(company_name) = lower(v_company)
     and md5(description) = md5(v_desc)
     and coalesce(lower(contact_email), '') = coalesce(lower(v_email), '')
   order by created_at desc
   limit 1;
  if v_id is not null then
    return v_id;
  end if;
  -- (b) Platform-wide ceiling: 30 intakes per hour (observed peak: 1).
  select count(*) into v_n
    from public.company_need_public_intakes
   where created_at > now() - interval '1 hour';
  if v_n >= 30 then
    raise exception 'intake_rate_limited' using errcode = 'P0004';
  end if;
  -- (c) Per-address ceiling: 3 intakes per contact email per 24 h.
  if v_email is not null then
    select count(*) into v_n
      from public.company_need_public_intakes
     where lower(contact_email) = lower(v_email)
       and created_at > now() - interval '24 hours';
    if v_n >= 3 then
      raise exception 'intake_rate_limited' using errcode = 'P0004';
    end if;
  end if;

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
end $function$;
