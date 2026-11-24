-- Rollback for supabase/migrations/20260829130000_anon_write_bounds_v1.sql
--
-- READ THIS BEFORE RUNNING IT. Rolling back REOPENS the gap: anonymous
-- callers can again insert unbounded pilot_events metadata, unbounded
-- waitlist rows, and unlimited public intakes with no duplicate check —
-- limited only by the app's per-instance in-memory windows, which a direct
-- PostgREST call never touches. Run it only to restore the exact
-- pre-migration state and re-apply as soon as the cause is known.
--
-- What it restores, verbatim:
--   • drops the three ceilings (two triggers + helper functions);
--   • drops the CHECK constraints and the index the migration added;
--   • submit_company_need_public_v1 as defined in
--     20260707120000_company_need_public_intake.sql (no bounds), with the
--     same ACL statements that file made.
-- No anon grant or policy is touched in either direction.

begin;

drop trigger if exists trg_pilot_events_ceiling on public.pilot_events;
drop function if exists public.pilot_events_ceiling();
alter table public.pilot_events drop constraint if exists pilot_events_metadata_bounded;

drop trigger if exists trg_waitlist_ceiling on public.waitlist;
drop function if exists public.waitlist_ceiling();
alter table public.waitlist
  drop constraint if exists waitlist_email_bounded,
  drop constraint if exists waitlist_source_bounded,
  drop constraint if exists waitlist_locale_bounded;

alter table public.company_need_public_intakes
  drop constraint if exists cnpi_company_name_bounded,
  drop constraint if exists cnpi_description_bounded,
  drop constraint if exists cnpi_country_bounded,
  drop constraint if exists cnpi_contact_bounded,
  drop constraint if exists cnpi_text_bounded,
  drop constraint if exists cnpi_headcount_bounded;
drop index if exists public.cnpi_created_at_idx;

-- ── 20260707120000 submit_company_need_public_v1, verbatim ─────────────────
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
