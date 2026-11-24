-- W6 author/subject slice — DATABASE PROOF (LOCAL STACK ONLY).
-- Proves migration 20260806230000_experience_author_subject_v1 end-to-end:
-- author side vs subject type, org-scoped booking subjects, live-authority
-- org authorship, one-org-voice-per-interaction, revocation semantics,
-- moderation/response/dispute unchanged, neighbouring domains untouched.
--
-- Runs entirely inside ONE transaction and ROLLS BACK: it leaves no rows.
-- Every check prints PASS/FAIL with the rule it proves.
--
-- Usage (local only, verified 127.0.0.1:54322), AFTER the migration is
-- applied to the local stack:
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--        -f apps/web/scripts/w6-author-subject-proof.sql

\set ON_ERROR_STOP off
begin;

-- Refuse to run anywhere but a local database.
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

do $$
declare
  -- people
  v_worker_p uuid := '22222222-0000-0000-0000-0000000000b1'; -- worker W
  v_owner_a  uuid := '22222222-0000-0000-0000-0000000000b2'; -- owner of org A
  v_mgr_a    uuid := '22222222-0000-0000-0000-0000000000b3'; -- manager in org A
  v_member_a uuid := '22222222-0000-0000-0000-0000000000b4'; -- plain member in A
  v_revoked  uuid := '22222222-0000-0000-0000-0000000000b5'; -- revoked manager of A
  v_owner_b  uuid := '22222222-0000-0000-0000-0000000000b6'; -- owner of org B
  v_owner_c  uuid := '22222222-0000-0000-0000-0000000000b7'; -- owner of unrelated C
  v_admin    uuid := '22222222-0000-0000-0000-0000000000b8'; -- moderator
  -- orgs
  v_org_a uuid; v_org_b uuid; v_org_c uuid;
  -- interactions
  v_worker uuid; v_req uuid;
  v_booking uuid;        -- org-scoped booking (A ↔ W), started
  v_booking_free uuid;   -- personal booking (ownerB personally ↔ W), started
  v_eng uuid;            -- ended engagement (W at A)
  v_eng_active uuid;     -- ACTIVE engagement (ineligible)
  -- records
  v_rec_about_w uuid;    -- A (via manager) about worker W
  v_rec_about_a uuid;    -- W about organization A
  v_resp uuid;
  v_res jsonb; v_counts jsonb; v_n int; v_txt text; v_flag boolean;
  -- untouched-domain fingerprints
  v_eng_count_before int; v_mem_count_before int; v_book_count_before int;
begin
  -- ── Column presence: the migration under proof must be applied here ──────
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='experience_records'
     and column_name='author_side';
  if not found then
    raise exception 'author_side column missing — apply 20260806230000 to the local stack first';
  end if;

  -- ── Cast ─────────────────────────────────────────────────────────────────
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.email, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  from (values (v_worker_p,'w6as.worker@local.test'), (v_owner_a,'w6as.ownera@local.test'),
               (v_mgr_a,'w6as.mgra@local.test'), (v_member_a,'w6as.membera@local.test'),
               (v_revoked,'w6as.revoked@local.test'), (v_owner_b,'w6as.ownerb@local.test'),
               (v_owner_c,'w6as.ownerc@local.test'), (v_admin,'w6as.admin@local.test')
       ) as u(id, email)
  on conflict (id) do nothing;

  insert into public.profiles (id, email, full_name, active_role)
  values (v_worker_p,'w6as.worker@local.test','W6AS Worker','worker'),
         (v_owner_a,'w6as.ownera@local.test','W6AS Owner A','company'),
         (v_mgr_a,'w6as.mgra@local.test','W6AS Manager A','company'),
         (v_member_a,'w6as.membera@local.test','W6AS Member A','company'),
         (v_revoked,'w6as.revoked@local.test','W6AS Revoked','company'),
         (v_owner_b,'w6as.ownerb@local.test','W6AS Owner B','company'),
         (v_owner_c,'w6as.ownerc@local.test','W6AS Owner C','company'),
         (v_admin,'w6as.admin@local.test','W6AS Admin','admin')
  on conflict (id) do nothing;

  insert into public.profile_roles (profile_id, role)
  values (v_admin, 'admin') on conflict do nothing;

  insert into public.workers (profile_id, display_name)
  values (v_worker_p, 'W6AS Worker')
  on conflict (profile_id) do update set display_name = excluded.display_name
  returning id into v_worker;

  insert into public.organizations (owner_profile_id, organization_type, legal_name)
  values (v_owner_a, 'company', 'W6AS Org A') returning id into v_org_a;
  insert into public.organizations (owner_profile_id, organization_type, legal_name)
  values (v_owner_b, 'company', 'W6AS Org B') returning id into v_org_b;
  insert into public.organizations (owner_profile_id, organization_type, legal_name)
  values (v_owner_c, 'company', 'W6AS Org C') returning id into v_org_c;

  -- governance memberships in A (owner / manager / member / revoked manager)
  insert into public.company_memberships (organization_id, profile_id, role, status, source, accepted_at)
  values (v_org_a, v_owner_a,  'owner',   'active',  'proof', now()),
         (v_org_a, v_mgr_a,    'manager', 'active',  'proof', now()),
         (v_org_a, v_member_a, 'member',  'active',  'proof', now());
  insert into public.company_memberships (organization_id, profile_id, role, status, source, accepted_at, revoked_at)
  values (v_org_a, v_revoked,  'manager', 'revoked', 'proof', now(), now());
  insert into public.company_memberships (organization_id, profile_id, role, status, source, accepted_at)
  values (v_org_b, v_owner_b, 'owner', 'active', 'proof', now());
  insert into public.company_memberships (organization_id, profile_id, role, status, source, accepted_at)
  values (v_org_c, v_owner_c, 'owner', 'active', 'proof', now());

  -- ended engagement: worker W worked at org A (eligible BOTH directions)
  insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, status, ended_at, title, hash_self)
  values (v_worker_p, v_org_a, 'employee', 'ended', current_date - 1, 'W6AS engagement', 'w6as-proof-1')
  returning id into v_eng;
  -- ACTIVE engagement (ineligible — not completed)
  insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, status, title, hash_self)
  values (v_worker_p, v_org_a, 'employee', 'active', 'W6AS active', 'w6as-proof-2')
  returning id into v_eng_active;

  -- org-scoped booking: created by owner A, belongs to ORG A, started.
  -- The organization is set on the DEMAND row — the M-P0-6 inherit trigger
  -- (booking_requests_org_inherit) stamps the booking from its demand, and
  -- an explicitly-inserted booking organization would be overwritten anyway.
  insert into public.customer_requests (profile_id, title, status, organization_id)
  values (v_owner_a, 'W6AS demand', 'approved', v_org_a) returning id into v_req;
  insert into public.booking_requests (owner_id, request_id, worker_id, status, start_date)
  values (v_owner_a, v_req, v_worker, 'accepted', current_date - 1)
  returning id into v_booking;
  select (organization_id = v_org_a) into v_flag
    from public.booking_requests where id = v_booking;
  if not v_flag then
    raise exception 'seed defect: booking did not inherit organization A from its demand';
  end if;
  -- personal booking with NO organization (owner B acting personally) —
  -- its OWN demand row, deliberately org-free. Different dates on purpose:
  -- the W12 exclusion constraint forbids two accepted bookings of the same
  -- worker over overlapping date ranges.
  insert into public.customer_requests (profile_id, title, status)
  values (v_owner_b, 'W6AS personal demand', 'approved') returning id into v_req;
  insert into public.booking_requests (owner_id, request_id, worker_id, status, start_date, expected_end_date)
  values (v_owner_b, v_req, v_worker, 'accepted', current_date - 10, current_date - 8)
  returning id into v_booking_free;

  select count(*) into v_eng_count_before  from public.engagement_contexts;
  select count(*) into v_mem_count_before  from public.company_memberships;
  select count(*) into v_book_count_before from public.booking_requests;

  -- ══ 1–2. ORGANIZATION A (via its manager) SUBMITS ABOUT WORKER W ══════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr_a)::text, true);
  v_res := public.submit_experience_record('worker', v_worker_p,
    'completed_engagement', v_eng, 'positive', 'Patikimas darbuotojas, darbai atlikti laiku.');
  v_rec_about_w := (v_res->>'id')::uuid;
  perform pg_temp.chk('1','organization A (manager author) CAN submit about worker W',
    v_res->>'ok' = 'true');
  select (subject_type = 'worker'
      and subject_profile_id = v_worker_p
      and author_side = 'organization'
      and author_organization_id = v_org_a
      and author_profile_id = v_mgr_a) into v_flag
    from public.experience_records where id = v_rec_about_w;
  perform pg_temp.chk('2','row: subject=worker W, author side=organization A, typist recorded',
    v_flag);

  -- ══ 3–4. WORKER W SUBMITS ABOUT ORGANIZATION A (engagement + org booking) ═
  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_p)::text, true);
  v_res := public.submit_experience_record('organization', v_org_a,
    'completed_engagement', v_eng, 'negative', 'Sąlygos skyrėsi nuo sutartų.');
  v_rec_about_a := (v_res->>'id')::uuid;
  perform pg_temp.chk('3','worker W CAN submit about organization A (engagement)',
    v_res->>'ok' = 'true');
  select (subject_type = 'organization'
      and subject_organization_id = v_org_a
      and subject_profile_id is null
      and author_side = 'person'
      and author_organization_id is null) into v_flag
    from public.experience_records where id = v_rec_about_a;
  perform pg_temp.chk('4','row: subject=organization A, author side=person',
    v_flag);

  -- org-scoped BOOKING: the employer party IS the organization
  v_res := public.submit_experience_record('organization', v_org_a,
    'accepted_booking', v_booking, 'positive', 'Užsakymas vyko sklandžiai.');
  perform pg_temp.chk('4b','org-scoped booking: worker''s subject IS organization A',
    v_res->>'ok' = 'true');
  -- ...and the old defect shape is REFUSED: person-subject about the owner
  v_res := public.submit_experience_record('worker', v_owner_a,
    'accepted_booking', v_booking, 'positive', 'wrong subject shape');
  perform pg_temp.chk('4c','org-scoped booking: owner''s PERSONAL profile is refused as subject',
    v_res->>'code' = 'not_eligible');
  -- personal booking still resolves person-to-person
  v_res := public.submit_experience_record('worker', v_owner_b,
    'accepted_booking', v_booking_free, 'positive', 'Asmeninis užsakymas įvykdytas.');
  perform pg_temp.chk('4d','personal booking (no org): person subject stays truthful',
    v_res->>'ok' = 'true');

  -- ══ 5. AUTHOR IDENTITY STAYS DISTINCT ═════════════════════════════════════
  select count(distinct author_profile_id) into v_n from public.experience_records
   where id in (v_rec_about_w, v_rec_about_a);
  perform pg_temp.chk('5','author identities remain distinct people on the two rows', v_n = 2);

  -- ══ 6. ORG B CANNOT SUBMIT ON A''S INTERACTION ════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b)::text, true);
  v_res := public.submit_experience_record('worker', v_worker_p,
    'completed_engagement', v_eng, 'positive', 'B intrudes');
  perform pg_temp.chk('6','organization B cannot submit on A''s interaction',
    v_res->>'code' = 'not_eligible');

  -- ══ 7. UNRELATED C: ANTI-ORACLE REFUSAL ═══════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_c)::text, true);
  v_res := public.submit_experience_record('worker', v_worker_p,
    'completed_engagement', v_eng, 'positive', 'C probes');
  v_txt := v_res->>'code';
  v_res := public.submit_experience_record('worker', v_worker_p,
    'completed_engagement', gen_random_uuid(), 'positive', 'C probes nonexistent');
  perform pg_temp.chk('7','unrelated C gets the SAME refusal for a real and a fabricated id',
    v_txt = 'not_eligible' and v_res->>'code' = 'not_eligible');

  -- member (non-governance) may not speak for the organization
  perform set_config('request.jwt.claims', json_build_object('sub', v_member_a)::text, true);
  v_res := public.submit_experience_record('worker', v_worker_p,
    'completed_engagement', v_eng, 'positive', 'member tries');
  perform pg_temp.chk('7b','a plain member cannot author for the organization',
    v_res->>'code' = 'not_eligible');

  -- ══ 8. SELF-REVIEW IMPOSSIBLE ═════════════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_p)::text, true);
  v_res := public.submit_experience_record('worker', v_worker_p,
    'completed_engagement', v_eng, 'positive', 'self');
  perform pg_temp.chk('8','self-review impossible', v_res->>'code' = 'self_review');

  -- ══ 9. DUPLICATES: PER AUTHOR AND PER ORGANIZATION ════════════════════════
  v_res := public.submit_experience_record('organization', v_org_a,
    'completed_engagement', v_eng, 'positive', 'second vote');
  perform pg_temp.chk('9a','same author + interaction → duplicate returns the EXISTING id',
    v_res->>'code' = 'duplicate_for_interaction' and (v_res->>'id')::uuid = v_rec_about_a);
  -- the ORGANIZATION already spoke via its manager; the owner cannot add a 2nd org voice
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);
  v_res := public.submit_experience_record('worker', v_worker_p,
    'completed_engagement', v_eng, 'positive', 'owner adds a second org voice');
  perform pg_temp.chk('9b','the organization speaks ONCE per interaction, whoever types it',
    v_res->>'code' = 'duplicate_for_interaction' and (v_res->>'id')::uuid = v_rec_about_w);

  -- ══ 10. SENTIMENT STAYS BINARY ════════════════════════════════════════════
  v_res := public.submit_experience_record('worker', v_worker_p,
    'accepted_booking', v_booking, 'neutral', 'no scale');
  perform pg_temp.chk('10','sentiment is ONLY positive|negative',
    v_res->>'code' = 'invalid_sentiment');

  -- ineligible: ACTIVE engagement grounds nothing
  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_p)::text, true);
  v_res := public.submit_experience_record('organization', v_org_a,
    'completed_engagement', v_eng_active, 'positive', 'not ended yet');
  perform pg_temp.chk('10b','an ACTIVE engagement cannot ground a record',
    v_res->>'code' = 'not_eligible');

  -- ══ 11. MODERATION PUBLISHES BOTH SUBJECT SHAPES ══════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
  perform public.start_experience_moderation(v_rec_about_w);
  v_res := public.decide_experience_moderation(v_rec_about_w, 'published', 'checked');
  perform pg_temp.chk('11a','worker-subject record publishes', v_res->>'status' = 'published');
  perform public.start_experience_moderation(v_rec_about_a);
  v_res := public.decide_experience_moderation(v_rec_about_a, 'published', 'checked');
  perform pg_temp.chk('11b','organization-subject record publishes', v_res->>'status' = 'published');

  -- ══ 12–13. RESPONSE: EXACT RECORD, SUBJECT SIDE, ONCE ═════════════════════
  -- the ORG side responds to the record ABOUT the organization
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr_a)::text, true);
  v_res := public.submit_experience_response(v_rec_about_a, 'Atsakome: sąlygos buvo suderintos raštu.');
  v_resp := (v_res->>'id')::uuid;
  perform pg_temp.chk('12','the subject organization''s manager can file the response',
    v_res->>'ok' = 'true');
  select (experience_record_id = v_rec_about_a) into v_flag
    from public.experience_responses where id = v_resp;
  perform pg_temp.chk('12b','the response attaches to the EXACT experience', v_flag);
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a)::text, true);
  v_res := public.submit_experience_response(v_rec_about_a, 'second response');
  perform pg_temp.chk('13','ONE response only — a second is refused',
    v_res->>'code' = 'response_exists');

  -- ══ 14. PUBLIC COUNTS SEPARATE THE SUBJECTS ═══════════════════════════════
  v_counts := public.get_experience_counts('worker', v_worker_p);
  perform pg_temp.chk('14a','counts about worker W: exactly the published worker-subject row',
    (v_counts->>'positive')::int = 1 and (v_counts->>'total_considered')::int = 1);
  v_counts := public.get_experience_counts('organization', v_org_a);
  perform pg_temp.chk('14b','counts about organization A: exactly the published org-subject row',
    (v_counts->>'negative')::int = 1 and (v_counts->>'total_considered')::int = 1);

  -- ══ 15. NO NUMERIC SCORE EXISTS ═══════════════════════════════════════════
  select count(*) into v_n from information_schema.columns
   where table_schema='public' and table_name='experience_records'
     and data_type in ('integer','numeric','real','double precision','smallint','bigint');
  perform pg_temp.chk('15','no numeric column exists on experience_records', v_n = 0);
  perform pg_temp.chk('15b','the count RPC returns ONLY the four transparent count keys',
    (select array_agg(k order by k) from jsonb_object_keys(v_counts) k)
      = array['disputed','negative','positive','total_considered']);

  -- ══ 16–17. REVOCATION ═════════════════════════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_revoked)::text, true);
  v_res := public.submit_experience_record('worker', v_worker_p,
    'completed_engagement', v_eng, 'positive', 'revoked manager tries');
  perform pg_temp.chk('16','a REVOKED manager cannot submit as the organization',
    v_res->>'code' = 'not_eligible');
  -- revoke the manager who authored the published row — history is immutable
  update public.company_memberships set status='revoked', revoked_at=now()
   where organization_id=v_org_a and profile_id=v_mgr_a;
  select (moderation_status = 'published'
      and author_side = 'organization'
      and author_organization_id = v_org_a) into v_flag
    from public.experience_records where id = v_rec_about_w;
  perform pg_temp.chk('17','the historical published org-authored row survives revocation intact',
    v_flag);
  perform set_config('request.jwt.claims', json_build_object('sub', v_mgr_a)::text, true);
  v_res := public.submit_experience_record('worker', v_worker_p,
    'accepted_booking', v_booking, 'positive', 'now-revoked manager, new attempt');
  perform pg_temp.chk('17b','the now-revoked manager cannot author NEW org records',
    v_res->>'code' = 'not_eligible');

  -- ══ 18. DISPUTE STAYS A SEPARATE DIMENSION ════════════════════════════════
  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_p)::text, true);
  v_res := public.open_experience_dispute(v_rec_about_w, 'Nesutinku su vertinimu.');
  perform pg_temp.chk('18a','the subject can open a dispute', v_res->>'dispute' = 'opened');
  select (moderation_status = 'published' and dispute_status = 'opened') into v_flag
    from public.experience_records where id = v_rec_about_w;
  perform pg_temp.chk('18b','a disputed record STAYS published — separate dimensions',
    v_flag);

  -- ══ 19. NEIGHBOURING DOMAINS UNTOUCHED ════════════════════════════════════
  select count(*) into v_n from public.engagement_contexts;
  perform pg_temp.chk('19a','engagement rows unchanged', v_n = v_eng_count_before);
  select count(*) into v_n from public.company_memberships
   where not (organization_id = v_org_a and profile_id = v_mgr_a);
  perform pg_temp.chk('19b','membership rows unchanged (except the deliberate 17 revocation)',
    v_n = v_mem_count_before - 1);
  select count(*) into v_n from public.booking_requests;
  perform pg_temp.chk('19c','booking rows unchanged', v_n = v_book_count_before);

  -- ══ 20. CONSTRAINT-LEVEL BACKSTOPS (belt for the RPC''s braces) ═══════════
  begin
    insert into public.experience_records
      (author_profile_id, author_side, subject_type, subject_profile_id,
       interaction_kind, interaction_id, sentiment, body)
    values (v_owner_c, 'organization', 'worker', v_worker_p,
       'completed_engagement', gen_random_uuid(), 'positive', 'shape violation');
    perform pg_temp.chk('20a','CHECK refuses org author side without an organization', false);
  exception when check_violation then
    perform pg_temp.chk('20a','CHECK refuses org author side without an organization', true);
  end;
  begin
    insert into public.experience_records
      (author_profile_id, author_side, author_organization_id,
       subject_type, subject_organization_id,
       interaction_kind, interaction_id, sentiment, body)
    values (v_owner_a, 'organization', v_org_a, 'organization', v_org_a,
       'completed_engagement', gen_random_uuid(), 'positive', 'org reviews itself');
    perform pg_temp.chk('20b','CHECK refuses an organization reviewing itself', false);
  exception when check_violation then
    perform pg_temp.chk('20b','CHECK refuses an organization reviewing itself', true);
  end;
end $$;

select step, rule, result from proof order by step;
select case when count(*) filter (where result = 'FAIL') = 0
       then 'W6_AUTHOR_SUBJECT_DATABASE_MODEL_PROVEN'
       else 'PROOF FAILED — ' || count(*) filter (where result = 'FAIL') || ' failing check(s)'
       end as verdict
from proof;

rollback;
