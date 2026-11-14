-- @human-gate-approved
-- (Acknowledges the SECURITY DEFINER re-create for CI only. The owner ordered PREPARING this
--  migration on 2026-11-10; applying it to production needs a separate owner approval.)
-- ============================================================================
-- 20261110190000 — public company-need intake: an answer not given stays unknown
--
-- DEFECT (found on the 375 px production walk of 2026-11-10): an inquiry stored
-- answers the company never gave. The RPC turned an empty value into a default:
--   urgency        → 'flexible'
--   accommodation  → 'not_provided'
--   engagement     → 'employment'
--   transport      → false
--   headcount      → 1
-- and a value outside the closed set into the same defaults. The operator read
-- "accommodation not provided, no transport, employment" as the company's word.
--
-- WHAT CHANGES (function body only):
--   - an empty, NULL or out-of-set urgency / accommodation / engagement is NULL;
--   - transport_needed is stored as sent (NULL = not answered);
--   - headcount NULL stays NULL; a given headcount is still clamped 1..100000;
--   - the parameter defaults of p_headcount (1) and p_transport_needed (false)
--     become NULL, so a caller that omits them stores "unknown" too. Names,
--     types and order are unchanged; CREATE OR REPLACE accepts a changed
--     default (verified on PG16, both directions).
-- Everything else — required fields, country registry check, locale set,
-- length bounds, the anon_write_bounds_v1 abuse bounds, SECURITY DEFINER,
-- search_path, ownership and EXECUTE grants — is byte-identical to
-- 20261110140000 (production as read on 2026-11-10). No grant, no policy, no
-- table change.
--
-- TESTED (local PostgreSQL 16, minimal stand-in table): old body → nothing
-- answered stored as 1 / flexible / not_provided / false / employment; this
-- body → NULL for each; answers given stored as given; out-of-set values NULL;
-- headcount 0 → 1 and 500000 → 100000 as before; the down file restores the
-- old body and defaults exactly.
--
-- COLUMNS: all five are already nullable with no default and no CHECK beyond
-- length (verified on production 2026-11-10), so NULL needs no DDL.
--
-- READERS (all already NULL-safe): admin intake queue (lib/admin/company-need-
-- intakes.ts, page shows "—"), claim bridge (lib/company/claim-public-intake.ts
-- maps only yes/no/unknown, absent stays absent), owner Telegram alert.
--
-- ORDER: the app change in the same PR starts sending NULL for an unchosen
-- answer. Before this migration is applied that NULL is still turned into the
-- old default (today's behaviour, no regression); after it, it stays unknown.
--
-- IMPACT: new intakes only. Existing rows are not touched and not backfilled:
-- which of their values were chosen cannot be known, so none is rewritten.
--
-- ROLLBACK (down): supabase/rollbacks/20261110190000_company_need_intake_unknown_not_default_v1.down.sql
-- restores the 20261110140000 body exactly. Rows stored with NULL in between
-- keep NULL (truthful); no data is lost either way.
-- ============================================================================

create or replace function public.submit_company_need_public_v1(p_locale text, p_company_name text, p_contact_name text default null::text, p_contact_email text default null::text, p_contact_phone text default null::text, p_country text default null::text, p_city_region text default null::text, p_sector text default null::text, p_headcount integer default null::integer, p_start_window text default null::text, p_expected_duration text default null::text, p_urgency text default null::text, p_accommodation text default null::text, p_transport_needed boolean default null::boolean, p_languages text default null::text, p_engagement_type text default null::text, p_description text default null::text, p_source_path text default null::text)
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
  v_head    integer := p_headcount;
  v_urgency text := lower(nullif(btrim(coalesce(p_urgency, '')), ''));
  v_acc     text := lower(nullif(btrim(coalesce(p_accommodation, '')), ''));
  v_eng     text := lower(nullif(btrim(coalesce(p_engagement_type, '')), ''));
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

  -- Closed enum sets. An answer the company did not give stays NULL (unknown);
  -- a value outside the set is not an answer either, so it is NULL too.
  if v_urgency not in ('asap','weeks','flexible') then v_urgency := null; end if;
  if v_acc not in ('provided_free','provided_paid','provided_deducted','not_provided') then
    v_acc := null;
  end if;
  if v_eng not in ('employment','subcontracting','agency_supply') then v_eng := null; end if;
  if v_locale not in ('en','lt','lv','et','nl','de','da','no','sv','pl','ru') then v_locale := 'lt'; end if;

  -- Clamp a given headcount to a sane range; no headcount stays NULL.
  if v_head is not null and v_head < 1 then v_head := 1; end if;
  if v_head is not null and v_head > 100000 then v_head := 100000; end if;

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
    p_transport_needed,
    nullif(btrim(coalesce(p_languages, '')), ''),
    v_eng, v_desc,
    nullif(btrim(coalesce(p_source_path, '')), ''),
    'new'
  )
  returning id into v_id;

  return v_id;
end $function$;
