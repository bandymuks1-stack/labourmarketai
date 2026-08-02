-- W6 slice 3 — experience domain BEHAVIOURAL + RLS proof (LOCAL STACK ONLY).
-- Runs entirely inside ONE transaction and ROLLS BACK: it leaves no rows.
-- Every check prints PASS/FAIL with the rule it proves.
--
-- Usage (local only, verified 127.0.0.1:54322):
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--        -f apps/web/scripts/w6-experience-domain-proof.sql

\set ON_ERROR_STOP off
begin;

-- Refuse to run anywhere but a local database. A local Supabase stack answers
-- from loopback or a private Docker network; a cloud project answers from a
-- PUBLIC address. Anything public is refused outright.
do $$
declare a inet := inet_server_addr();
begin
  if a is not null
     and not (a << inet '127.0.0.0/8' or a = inet '::1'
           or a << inet '10.0.0.0/8' or a << inet '172.16.0.0/12'
           or a << inet '192.168.0.0/16') then
    raise exception 'REFUSING: not a local database (%) — this script never runs against a shared or production stack', a;
  end if;
end $$;

create temporary table proof(step text, rule text, result text) on commit drop;
create or replace function pg_temp.chk(p_step text, p_rule text, p_ok boolean)
returns void language sql as $$
  insert into proof values (p_step, p_rule, case when p_ok then 'PASS' else 'FAIL' end);
$$;
-- the RLS section below runs under the real authenticated/anon roles, which
-- must still be able to record their own results into the temp ledger.
grant all on proof to authenticated, anon;
grant execute on function pg_temp.chk(text, text, boolean) to authenticated, anon;

-- ── Actors: an org owner (author), a worker (subject), an outsider, an admin.
do $$
declare
  v_author uuid := '11111111-0000-0000-0000-0000000000a1';
  v_worker_profile uuid := '11111111-0000-0000-0000-0000000000a2';
  v_outsider uuid := '11111111-0000-0000-0000-0000000000a3';
  v_admin uuid := '11111111-0000-0000-0000-0000000000a4';
  v_worker uuid;
  v_req uuid;
  v_booking uuid;
  v_rec uuid;
  v_resp uuid;
  v_res jsonb;
  v_counts jsonb;
  v_n int;
begin
  -- public.profiles references auth.users — create the four auth rows first.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.email, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  from (values (v_author,'w6.author@local.test'), (v_worker_profile,'w6.worker@local.test'),
               (v_outsider,'w6.outsider@local.test'), (v_admin,'w6.admin@local.test')
       ) as u(id, email)
  on conflict (id) do nothing;

  insert into public.profiles (id, email, full_name, active_role)
  values (v_author,'w6.author@local.test','W6 Author','company'),
         (v_worker_profile,'w6.worker@local.test','W6 Worker','worker'),
         (v_outsider,'w6.outsider@local.test','W6 Outsider','company'),
         (v_admin,'w6.admin@local.test','W6 Admin','admin')
  on conflict (id) do nothing;

  -- The MODERATOR actor. profiles.active_role = 'admin' is deliberately
  -- unusable here: the platform's P0 trg_profiles_admin_grant_guard strips a
  -- self-assigned admin role on insert (nobody self-promotes). A real admin is
  -- provisioned out-of-band through profile_roles, which is is_admin()'s
  -- second clause — that is the path used here.
  insert into public.profile_roles (profile_id, role)
  values (v_admin, 'admin') on conflict do nothing;

  -- a trigger may already have provisioned the worker row for a worker profile
  insert into public.workers (profile_id, display_name)
  values (v_worker_profile, 'W6 Worker')
  on conflict (profile_id) do update set display_name = excluded.display_name
  returning id into v_worker;

  -- A REAL eligible interaction: an accepted booking that has started.
  insert into public.customer_requests (profile_id, title, status)
  values (v_author, 'W6 demand', 'approved') returning id into v_req;
  insert into public.booking_requests (owner_id, request_id, worker_id, status, start_date)
  values (v_author, v_req, v_worker, 'accepted', current_date - 1)
  returning id into v_booking;

  -- ══ 1. ELIGIBILITY ════════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider)::text, true);
  v_res := public.submit_experience_record('worker', v_worker_profile,
    'accepted_booking', v_booking, 'positive', 'outsider tries');
  perform pg_temp.chk('1a','a non-party cannot create an experience',
    v_res->>'code' = 'not_eligible');

  perform set_config('request.jwt.claims', json_build_object('sub', v_author)::text, true);
  v_res := public.submit_experience_record('worker', v_author,
    'accepted_booking', v_booking, 'positive', 'self review');
  perform pg_temp.chk('1b','self-review is impossible', v_res->>'code' = 'self_review');

  v_res := public.submit_experience_record('worker', v_worker_profile,
    'accepted_booking', gen_random_uuid(), 'positive', 'fabricated interaction');
  perform pg_temp.chk('1c','a free interaction_id proves nothing',
    v_res->>'code' = 'not_eligible');

  -- an accepted booking that has NOT started yet is not completed
  update public.booking_requests set start_date = current_date + 5 where id = v_booking;
  v_res := public.submit_experience_record('worker', v_worker_profile,
    'accepted_booking', v_booking, 'positive', 'not started yet');
  perform pg_temp.chk('1d','an unfinished interaction cannot ground a record',
    v_res->>'code' = 'not_eligible');
  update public.booking_requests set start_date = current_date - 1 where id = v_booking;

  v_res := public.submit_experience_record('worker', v_worker_profile,
    'accepted_booking', v_booking, 'neutral', 'neutral sentiment');
  perform pg_temp.chk('1e','no neutral/numeric sentiment exists',
    v_res->>'code' = 'invalid_sentiment');

  -- the real, eligible submission
  v_res := public.submit_experience_record('worker', v_worker_profile,
    'accepted_booking', v_booking, 'negative', 'Darbas nebuvo baigtas sutartu laiku.');
  v_rec := (v_res->>'id')::uuid;
  perform pg_temp.chk('1f','an eligible party CAN submit',
    v_res->>'ok' = 'true' and v_res->>'status' = 'submitted');

  -- ══ 2. DUPLICATE / IDEMPOTENCY ════════════════════════════════════════════
  v_res := public.submit_experience_record('worker', v_worker_profile,
    'accepted_booking', v_booking, 'positive', 'second vote attempt');
  perform pg_temp.chk('2a','a duplicate returns the EXISTING record, never a 2nd vote',
    v_res->>'code' = 'duplicate_for_interaction' and (v_res->>'id')::uuid = v_rec);
  select count(*) into v_n from public.experience_records
   where author_profile_id = v_author and interaction_id = v_booking;
  perform pg_temp.chk('2b','still exactly ONE row after the duplicate', v_n = 1);

  -- ══ 3. MODERATION LIFECYCLE ═══════════════════════════════════════════════
  v_res := public.decide_experience_moderation(v_rec, 'published', 'author self-publishes');
  perform pg_temp.chk('3a','the AUTHOR can never self-publish',
    v_res->>'code' = 'not_authorized');

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  v_res := public.decide_experience_moderation(v_rec, 'published', 'skip the queue');
  perform pg_temp.chk('3b','submitted -> published is NOT a legal shortcut',
    v_res->>'code' = 'invalid_transition');

  v_res := public.start_experience_moderation(v_rec);
  perform pg_temp.chk('3c','submitted -> in_moderation', v_res->>'status' = 'in_moderation');

  v_res := public.decide_experience_moderation(v_rec, 'published', '');
  perform pg_temp.chk('3d','publishing REQUIRES a reason', v_res->>'code' = 'reason_required');

  v_res := public.decide_experience_moderation(v_rec, 'published', 'Faktai atitinka sąveiką.');
  perform pg_temp.chk('3e','in_moderation -> published with a reason',
    v_res->>'status' = 'published');

  select count(*) into v_n from public.audit_logs
   where entity = 'experience_record' and entity_id = v_rec
     and action in ('experience_submitted','moderation_started','moderation_decided');
  perform pg_temp.chk('3f','every moderation step appended an audit row', v_n = 3);

  -- ══ 4. COUNT-ONLY AGGREGATION ═════════════════════════════════════════════
  v_counts := public.get_experience_counts('worker', v_worker_profile);
  perform pg_temp.chk('4a','published negative counts, positive stays 0',
    (v_counts->>'negative')::int = 1 and (v_counts->>'positive')::int = 0);
  perform pg_temp.chk('4b','no disputed rows yet', (v_counts->>'disputed')::int = 0);

  -- ══ 5. RIGHT OF REPLY ═════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider)::text, true);
  v_res := public.submit_experience_response(v_rec, 'outsider replies');
  perform pg_temp.chk('5a','only the SUBJECT side may reply', v_res->>'code' = 'not_subject');

  perform set_config('request.jwt.claims', json_build_object('sub', v_author)::text, true);
  v_res := public.submit_experience_response(v_rec, 'author replies to own record');
  perform pg_temp.chk('5b','the record AUTHOR cannot use the reply channel',
    v_res->>'code' = 'not_subject');

  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_profile)::text, true);
  v_res := public.submit_experience_response(v_rec, 'Darbas buvo sustabdytas dėl tiekimo.');
  v_resp := (v_res->>'id')::uuid;
  perform pg_temp.chk('5c','the subject may file ONE response', v_res->>'ok' = 'true');

  v_res := public.submit_experience_response(v_rec, 'second response');
  perform pg_temp.chk('5d','a second response is refused', v_res->>'code' = 'response_exists');

  v_counts := public.get_experience_counts('worker', v_worker_profile);
  perform pg_temp.chk('5e','a response NEVER changes the counts',
    (v_counts->>'negative')::int = 1 and (v_counts->>'positive')::int = 0);

  -- ══ 6. DISPUTE — A SEPARATE DIMENSION ═════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider)::text, true);
  v_res := public.open_experience_dispute(v_rec, 'outsider disputes');
  perform pg_temp.chk('6a','only the subject side may dispute', v_res->>'code' = 'not_subject');

  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_profile)::text, true);
  v_res := public.open_experience_dispute(v_rec, '');
  perform pg_temp.chk('6b','opening a dispute REQUIRES a reason',
    v_res->>'code' = 'reason_required');

  v_res := public.open_experience_dispute(v_rec, 'Faktai neatitinka: darbas buvo priimtas.');
  perform pg_temp.chk('6c','the subject opens a dispute', v_res->>'dispute' = 'opened');

  perform pg_temp.chk('6d','the moderation state is NOT lost when disputed',
    (select moderation_status from public.experience_records where id = v_rec) = 'published');

  v_counts := public.get_experience_counts('worker', v_worker_profile);
  perform pg_temp.chk('6e','a disputed published row STAYS counted AND is surfaced',
    (v_counts->>'negative')::int = 1 and (v_counts->>'disputed')::int = 1);

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  v_res := public.resolve_experience_dispute(v_rec, 'removed', 'skip review');
  perform pg_temp.chk('6f','opened -> resolved is NOT a legal shortcut',
    v_res->>'code' = 'invalid_transition');

  v_res := public.review_experience_dispute(v_rec);
  perform pg_temp.chk('6g','opened -> under_review', v_res->>'dispute' = 'under_review');

  v_res := public.resolve_experience_dispute(v_rec, 'removed', '');
  perform pg_temp.chk('6h','resolving REQUIRES a reason', v_res->>'code' = 'reason_required');

  v_res := public.resolve_experience_dispute(v_rec, 'removed',
    'Įrašas neatitiko faktų — pašalinta iš viešo pateikimo.');
  perform pg_temp.chk('6i','under_review -> resolved_removed',
    v_res->>'dispute' = 'resolved_removed');

  v_counts := public.get_experience_counts('worker', v_worker_profile);
  perform pg_temp.chk('6j','resolved_removed leaves the counts entirely',
    (v_counts->>'negative')::int = 0 and (v_counts->>'total_considered')::int = 0);

  perform pg_temp.chk('6k','the row still EXISTS — no silent delete',
    (select count(*) from public.experience_records where id = v_rec) = 1);

  select count(*) into v_n from public.audit_logs
   where entity = 'experience_record' and entity_id = v_rec;
  perform pg_temp.chk('6l','the full audit history survived the removal', v_n >= 6);

  select count(*) into v_n from public.audit_logs
   where entity = 'experience_record' and entity_id = v_rec
     and action = 'dispute_resolved'
     and payload->>'prev_status' = 'under_review'
     and payload->>'new_status' = 'resolved_removed'
     and payload->>'reason' is not null;
  perform pg_temp.chk('6m','the audit row carries prev/new state + reason', v_n = 1);
end $$;

-- ══ 7. RLS — who can SELECT what (real roles, real policies) ════════════════
set local role authenticated;

-- the record author
select set_config('request.jwt.claims',
  json_build_object('sub','11111111-0000-0000-0000-0000000000a1')::text, true);
select pg_temp.chk('7a','the author sees their own record',
  (select count(*) from public.experience_records) = 1);

-- the subject (record is published → visible)
select set_config('request.jwt.claims',
  json_build_object('sub','11111111-0000-0000-0000-0000000000a2')::text, true);
select pg_temp.chk('7b','the subject sees a PUBLISHED record about them',
  (select count(*) from public.experience_records) = 1);

-- an unrelated authenticated user (another org / workspace)
select set_config('request.jwt.claims',
  json_build_object('sub','11111111-0000-0000-0000-0000000000a3')::text, true);
select pg_temp.chk('7c','an unrelated user sees NOTHING (no cross-workspace read)',
  (select count(*) from public.experience_records) = 0);
select pg_temp.chk('7d','an unrelated user sees no responses',
  (select count(*) from public.experience_responses) = 0);

-- anon: holds NOTHING in this domain — the read is refused at the grant
-- layer, before RLS is even consulted (hardened after this proof caught anon
-- retaining Supabase's default SELECT grant).
set local role anon;
do $$
declare denied boolean := false;
begin
  begin
    perform count(*) from public.experience_records;
  exception when insufficient_privilege then denied := true;
  end;
  perform pg_temp.chk('7e','anon is refused at the GRANT layer on records', denied);
  denied := false;
  begin
    perform count(*) from public.experience_responses;
  exception when insufficient_privilege then denied := true;
  end;
  perform pg_temp.chk('7f','anon is refused at the GRANT layer on responses', denied);
end $$;

reset role;

-- ══ 8. Grants: anon can execute nothing in this domain ══════════════════════
select pg_temp.chk('8a','anon holds EXECUTE on no experience function',
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '%experience%'
      and has_function_privilege('anon', p.oid, 'execute')) = 0);
select pg_temp.chk('8b','anon holds no INSERT/UPDATE/DELETE on the tables',
  (select count(*) from information_schema.role_table_grants
    where table_schema='public' and table_name like 'experience%'
      and grantee = 'anon' and privilege_type in ('INSERT','UPDATE','DELETE')) = 0);
select pg_temp.chk('8c','authenticated holds no direct DML either (RPC-only)',
  (select count(*) from information_schema.role_table_grants
    where table_schema='public' and table_name like 'experience%'
      and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')) = 0);

\echo ''
\echo '════ W6 EXPERIENCE DOMAIN PROOF ════'
select step, result, rule from proof order by step;
select count(*) filter (where result='PASS') as passed,
       count(*) filter (where result='FAIL') as failed
from proof;

rollback;
