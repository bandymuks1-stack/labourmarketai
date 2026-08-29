-- @human-gate-approved — TIER: owner-gated (CREATE TRIGGER ×2, SECURITY
--   DEFINER ×3, REVOKE/GRANT on functions, ADD CONSTRAINT on three tables).
--   The marker is the doctrine ACKNOWLEDGEMENT that this file is RED; it is
--   not approval. OWNER APPROVAL: PENDING — DO NOT APPLY. Record the approval
--   line here and in docs/human-gates/ before `apply_migration`.
-- ═══════════════════════════════════════════════════════════════════════════
-- ANON WRITE BOUNDS v1
-- public intake stays open; anonymous cost gets a ceiling the database enforces
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CLASS: RED (grant-adjacent: triggers on anon-writable tables, SECURITY
-- DEFINER helpers, a public RPC recreated). Apply only via Supabase MCP
-- `apply_migration` after the owner's explicit approval. Never `db push`.
--
-- WHAT THIS MARKER COVERS, and nothing else (.github/scripts/migration-safety.mjs
-- finding names): create-trigger, security-definer-function, grant-or-revoke,
-- rls-to-anon (the RPC's EXECUTE grant re-stated `to anon, authenticated`,
-- exactly as 20260707120000 granted it — no table grant, no policy). It
-- covers no drop, no policy change, no table grant change, no auth object.
--
-- OBJECTIVE
--   PUBLIC INTAKE MUST REMAIN USABLE WITHOUT ALLOWING ANONYMOUS CLIENTS TO
--   CREATE UNBOUNDED OWNER COST.
--
-- THE DEFECT (Phase-1 audit C-2; measured on production 2026-08-29)
--   Three anonymous write paths exist by design. Every limit on them lived in
--   the application layer only — an in-memory, per-Vercel-instance sliding
--   window (lib/security/rate-limit.ts says so itself) — and every one of
--   them is reachable DIRECTLY with the public anon key, skipping the app:
--     • pilot_events    `grant insert … to anon` (20260702150000); the
--                       `metadata jsonb` column had NO size bound (0020 header:
--                       "the safety lives in lib/telemetry/actions.ts");
--                       1,559 rows, 820 anonymous, largest metadata 212 B.
--     • waitlist        anon INSERT `with check (true)` (0005); UNIQUE email
--                       stops repeats of ONE address, not unbounded distinct
--                       ones; no length CHECK on any column.
--     • submit_company_need_public_v1  anon-executable SECURITY DEFINER write
--                       of up to ~8 KB per call; the allowlist entry records
--                       "GAP — NO database-level rate limit, NO duplicate-
--                       submission check, NO per-IP or per-email throttle".
--   Observed peaks: anon pilot events 15/min; one profile 11/min; waitlist
--   3/hour; intakes 1/hour; 1 intake per contact email per day.
--
-- THE FIX — bounds at the lowest public boundary, additive
--   1. pilot_events: `metadata` must be a JSON object ≤ 4096 bytes (the app
--      already caps it at 2048 bytes of text; 4096 leaves room for jsonb's
--      binary form). A BEFORE INSERT ceiling: at most 300 anonymous rows per
--      minute platform-wide (20× the observed peak) and 120 rows per minute
--      per profile (10×). Telemetry is best-effort by contract — a rejected
--      row is logged by the action and dropped, never shown to a user.
--   2. waitlist: email/source/locale length + shape CHECKs mirroring the API
--      route's zod schema; a ceiling of 60 signups per hour platform-wide
--      (20× the observed peak). The route already answers 502 on any insert
--      error; the UNIQUE-email duplicate path is untouched.
--   3. submit_company_need_public_v1: inside the definer, after validation
--      and before the insert — (a) an exact duplicate within 24 h (same
--      company name, description and contact email) returns the EARLIER id
--      and writes nothing (an idempotent resubmit, not a rejection);
--      (b) 30 intakes per hour platform-wide (30× the observed peak);
--      (c) 3 intakes per contact email per 24 h. Ceilings raise errcode
--      P0004 — the repo's existing "too many" class (request_rate_limits_v3)
--      — which the app now maps to its existing `rate_limited` state (the
--      form already renders it honestly: prepared, not persisted).
--      Table-level CHECKs mirror every per-field ceiling the function
--      enforces, so no future write path can exceed them either.
--
-- PRIVACY-SAFE KEYS. Nothing new is stored. The ceilings count rows that
-- already exist; the per-address key is the contact email the submitter
-- chose to give; the duplicate check hashes the description in flight. No IP
-- address is recorded — the database never sees one, and recording one to
-- rate-limit would be new PII for a bound the global ceiling already gives.
--
-- WHAT IS DELIBERATELY NOT CHANGED
--   • the anon INSERT grants and the two anon policies stay exactly as they
--     are — the acquisition surfaces remain open;
--   • no retention/prune (a separate owner decision; these bounds cap the
--     growth RATE, not the total);
--   • no captcha/turnstile (app-side, separate);
--   • the app-side in-memory limiters stay as the first, cheaper brake.
--
-- ROLLBACK: supabase/rollbacks/20260829130000_anon_write_bounds_v1.down.sql
--   drops the constraints, triggers, helpers and index and restores the
--   20260707120000 function body verbatim. Rolling back REOPENS the gap.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. pilot_events ────────────────────────────────────────────────────────
alter table public.pilot_events
  add constraint pilot_events_metadata_bounded
  check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096);

-- SECURITY DEFINER on purpose: the SELECT policy on pilot_events is admin-only,
-- so a count run as the inserting role (anon / a worker) would always be 0.
create or replace function public.pilot_events_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if new.profile_id is null then
    select count(*) into v_n from public.pilot_events
     where profile_id is null and created_at > now() - interval '1 minute';
    if v_n >= 300 then
      raise exception 'pilot_events_anon_ceiling: too many anonymous events this minute'
        using errcode = 'P0004';
    end if;
  else
    select count(*) into v_n from public.pilot_events
     where profile_id = new.profile_id and created_at > now() - interval '1 minute';
    if v_n >= 120 then
      raise exception 'pilot_events_profile_ceiling: too many events this minute'
        using errcode = 'P0004';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.pilot_events_ceiling() from public;
revoke all on function public.pilot_events_ceiling() from anon;
revoke all on function public.pilot_events_ceiling() from authenticated;

drop trigger if exists trg_pilot_events_ceiling on public.pilot_events;
create trigger trg_pilot_events_ceiling
  before insert on public.pilot_events
  for each row execute function public.pilot_events_ceiling();

-- ── 2. waitlist ────────────────────────────────────────────────────────────
alter table public.waitlist
  add constraint waitlist_email_bounded
    check (char_length(email) <= 254
           and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  add constraint waitlist_source_bounded check (char_length(source) <= 60),
  add constraint waitlist_locale_bounded check (locale is null or char_length(locale) <= 16);

create or replace function public.waitlist_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  select count(*) into v_n from public.waitlist
   where created_at > now() - interval '1 hour';
  if v_n >= 60 then
    raise exception 'waitlist_ceiling: too many signups this hour'
      using errcode = 'P0004';
  end if;
  return new;
end $$;

revoke all on function public.waitlist_ceiling() from public;
revoke all on function public.waitlist_ceiling() from anon;
revoke all on function public.waitlist_ceiling() from authenticated;

drop trigger if exists trg_waitlist_ceiling on public.waitlist;
create trigger trg_waitlist_ceiling
  before insert on public.waitlist
  for each row execute function public.waitlist_ceiling();

-- ── 3. company_need_public_intakes — table-level mirrors of the RPC caps ───
alter table public.company_need_public_intakes
  add constraint cnpi_company_name_bounded check (char_length(company_name) <= 200),
  add constraint cnpi_description_bounded  check (char_length(description) <= 8000),
  add constraint cnpi_country_bounded      check (char_length(country) <= 8),
  add constraint cnpi_contact_bounded check (
    (contact_name  is null or char_length(contact_name)  <= 160) and
    (contact_email is null or char_length(contact_email) <= 254) and
    (contact_phone is null or char_length(contact_phone) <= 40)),
  add constraint cnpi_text_bounded check (
    (locale            is null or char_length(locale)            <= 16)  and
    (city_or_region    is null or char_length(city_or_region)    <= 160) and
    (sector            is null or char_length(sector)            <= 200) and
    (start_window      is null or char_length(start_window)      <= 40)  and
    (expected_duration is null or char_length(expected_duration) <= 120) and
    (urgency           is null or char_length(urgency)           <= 32)  and
    (accommodation     is null or char_length(accommodation)     <= 32)  and
    (languages         is null or char_length(languages)         <= 200) and
    (engagement_type   is null or char_length(engagement_type)   <= 32)  and
    (source_path       is null or char_length(source_path)       <= 200) and
    char_length(status) <= 32),
  add constraint cnpi_headcount_bounded check (headcount is null or headcount between 1 and 100000);

-- the two ceilings and the duplicate check scan by time; keep them cheap
create index if not exists cnpi_created_at_idx
  on public.company_need_public_intakes (created_at desc);

-- ── 4. submit_company_need_public_v1 — same contract, bounded ──────────────
-- Body identical to 20260707120000 up to the insert; the bounded block is
-- inserted between validation and the insert so invalid input never counts.
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
  v_n       int;
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
end $$;

-- ACLs re-stated with the same effect as 20260707120000: anon + authenticated
-- may execute; nothing on the table itself. Written with the NAMED signature
-- on one line, byte-for-byte the allowlist entry's `identityArgs`, so
-- lib/guards/secdef-anon-allowlist.test.ts matches it exactly (the same
-- function; parameter names do not change its identity).
revoke all on function public.submit_company_need_public_v1(p_locale text, p_company_name text, p_contact_name text, p_contact_email text, p_contact_phone text, p_country text, p_city_region text, p_sector text, p_headcount integer, p_start_window text, p_expected_duration text, p_urgency text, p_accommodation text, p_transport_needed boolean, p_languages text, p_engagement_type text, p_description text, p_source_path text) from public;
grant execute on function public.submit_company_need_public_v1(p_locale text, p_company_name text, p_contact_name text, p_contact_email text, p_contact_phone text, p_country text, p_city_region text, p_sector text, p_headcount integer, p_start_window text, p_expected_duration text, p_urgency text, p_accommodation text, p_transport_needed boolean, p_languages text, p_engagement_type text, p_description text, p_source_path text) to anon, authenticated;

commit;
