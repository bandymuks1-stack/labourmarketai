-- ============================================================================
-- ANON WRITE BOUNDS — REAL lowest-boundary proof, fully rolled back.
--
-- Every probe runs as the `anon` role with NO JWT — the exact position of a
-- client holding only the public key and calling PostgREST directly, i.e.
-- BYPASSING every Next.js route and every in-memory limiter. One transaction
-- against a LOCAL Supabase stack, ending with ROLLBACK: nothing persists.
--
-- Modes (psql variable `apply`):
--   apply=0   NEGATIVE CONTROL: no migration — the abuse must SUCCEED here.
--   apply=1   the migration (verbatim minus its own begin/commit, see the
--             wrapper) runs inside this transaction first.
-- Run through the wrapper only:  bash scripts/db-proof/anon-write-bounds.sh
-- Refuses any non-private server address. Never point it at production.
-- ============================================================================
\set ON_ERROR_STOP on
do $$
begin
  if inet_server_addr() is not null and not (
    inet_server_addr() << any (array['127.0.0.0/8','10.0.0.0/8','172.16.0.0/12','192.168.0.0/16']::inet[])
  ) then
    raise exception 'refusing to run: % is not a local stack address', inet_server_addr();
  end if;
end $$;

\if :apply
  \echo PROOF: mode => APPLY (migration executed inside this transaction)
  \i :migration_copy
\else
  \echo PROOF: mode => NEGATIVE CONTROL (no migration)
\endif

-- the probes are plpgsql so each rejection is caught and reported, not fatal.
-- P0004 (the repo's ceiling errcode) is Postgres' ASSERT_FAILURE, which
-- `when others` deliberately does NOT catch — so it is named explicitly.
create or replace function pg_temp.try(p_label text, p_sql text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise notice 'PROOF: % => ACCEPTED', p_label;
exception when assert_failure or others then
  raise notice 'PROOF: % => REJECTED %', p_label, sqlstate;
end $$;

-- how many of N attempts get through (each attempt in its own subtransaction)
create or replace function pg_temp.burst(p_label text, p_sql text, p_n int) returns void
language plpgsql as $$
declare
  i int; ok int := 0; first_reject text := null;
begin
  for i in 1..p_n loop
    begin
      execute replace(p_sql, '{i}', i::text);
      ok := ok + 1;
    exception when assert_failure or others then
      if first_reject is null then first_reject := sqlstate || ' at #' || i; end if;
    end;
  end loop;
  raise notice 'PROOF: % => % of % accepted%', p_label, ok, p_n,
    case when first_reject is null then '' else ' (first rejection ' || first_reject || ')' end;
end $$;

set local role anon;

-- ── pilot_events ────────────────────────────────────────────────────────────
select pg_temp.try('pilot_events legit anon insert (metadata 20 B)',
  $q$insert into public.pilot_events (session_id, route, locale, event_name, result, metadata)
     values ('proof-session', '/lt', 'lt', 'landing_viewed', 'info', '{"k":"v"}')$q$);
select pg_temp.try('pilot_events oversized metadata (6 KB)',
  $q$insert into public.pilot_events (session_id, route, locale, event_name, result, metadata)
     values ('proof-session', '/lt', 'lt', 'landing_viewed', 'info', jsonb_build_object('pad', repeat('x', 6000)))$q$);
select pg_temp.try('pilot_events metadata that is an array, not an object',
  $q$insert into public.pilot_events (session_id, route, locale, event_name, result, metadata)
     values ('proof-session', '/lt', 'lt', 'landing_viewed', 'info', '[1,2,3]')$q$);
select pg_temp.burst('pilot_events anon burst of 320 in one minute',
  $q$insert into public.pilot_events (session_id, route, locale, event_name, result, metadata)
     values ('proof-burst-{i}', '/lt', 'lt', 'landing_viewed', 'info', '{}')$q$, 320);

-- ── waitlist ────────────────────────────────────────────────────────────────
select pg_temp.try('waitlist legit anon insert',
  $q$insert into public.waitlist (email, source, locale) values ('proof.legit@local.test', 'landing_company_modal', 'lt')$q$);
select pg_temp.try('waitlist junk email',
  $q$insert into public.waitlist (email, source) values ('not-an-email', 'landing_company_modal')$q$);
select pg_temp.try('waitlist 400-char source',
  $q$insert into public.waitlist (email, source) values ('proof.src@local.test', repeat('s', 400))$q$);
select pg_temp.burst('waitlist anon burst of 70 distinct addresses in one hour',
  $q$insert into public.waitlist (email, source) values ('proof.burst{i}@local.test', 'landing_company_modal')$q$, 70);

-- ── submit_company_need_public_v1 ───────────────────────────────────────────
select pg_temp.try('intake legit submission',
  $q$select public.submit_company_need_public_v1('lt', 'Proof Builders', 'Ona', 'proof.ona@local.test', null, 'LT',
     'Vilnius', 'construction', 3, null, null, 'weeks', null, false, null, 'employment',
     'We need three tilers for a six-week job in Vilnius starting in October.', '/lt/company-need')$q$);
-- exact resubmission: BEFORE = a second row; AFTER = the same id, no new row
do $$
declare a uuid; b uuid;
begin
  a := public.submit_company_need_public_v1('lt', 'Proof Builders', 'Ona', 'proof.ona@local.test', null, 'LT',
     'Vilnius', 'construction', 3, null, null, 'weeks', null, false, null, 'employment',
     'Duplicate check: the very same description twice.', '/lt/company-need');
  b := public.submit_company_need_public_v1('lt', 'Proof Builders', 'Ona', 'proof.ona@local.test', null, 'LT',
     'Vilnius', 'construction', 3, null, null, 'weeks', null, false, null, 'employment',
     'Duplicate check: the very same description twice.', '/lt/company-need');
  raise notice 'PROOF: intake exact resubmission => %', case when a = b then 'SAME id, no new row' else 'NEW row each time' end;
end $$;
-- per-address ceiling: five DIFFERENT needs from one contact email
select pg_temp.burst('intake 5 distinct needs from one contact email in 24 h',
  $q$select public.submit_company_need_public_v1('lt', 'Proof Builders', 'Ona', 'proof.ona@local.test', null, 'LT',
     'Vilnius', 'construction', 3, null, null, 'weeks', null, false, null, 'employment',
     'Need number {i} from the same address.', '/lt/company-need')$q$, 5);
-- platform-wide ceiling: 40 distinct addresses in one hour
select pg_temp.burst('intake 40 distinct addresses in one hour',
  $q$select public.submit_company_need_public_v1('lt', 'Proof Co {i}', null, 'proof.co{i}@local.test', null, 'LT',
     null, null, 1, null, null, null, null, false, null, 'employment',
     'Distinct need from company {i}.', '/lt/company-need')$q$, 40);
-- validation still answers 22023, never counted against a ceiling
select pg_temp.try('intake invalid country (expect 22023)',
  $q$select public.submit_company_need_public_v1('lt', 'Proof Builders', null, null, null, 'US',
     null, null, 1, null, null, null, null, false, null, 'employment', 'Outside the market list.', '/lt/company-need')$q$);
-- the table itself stays sealed to anon in both modes
select pg_temp.try('intake table direct anon INSERT (must be denied in BOTH modes)',
  $q$insert into public.company_need_public_intakes (company_name, country, description) values ('x', 'LT', 'y')$q$);

reset role;
select 'PROOF: rows written in this transaction => pilot_events ' || (select count(*) from public.pilot_events where session_id like 'proof-%')::text
  || ', waitlist ' || (select count(*) from public.waitlist where email like 'proof.%')::text
  || ', intakes ' || (select count(*) from public.company_need_public_intakes where company_name like 'Proof %')::text as line;

rollback;
\echo PROOF: transaction => ROLLED BACK (nothing persisted)
