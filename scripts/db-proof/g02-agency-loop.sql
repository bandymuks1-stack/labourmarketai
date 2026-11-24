-- ===========================================================================
-- G-02 — THE AGENCY LOOP, END TO END, AGAINST THE REAL SCHEMA.
--
--   worker invited -> worker joins agency roster -> agency invites client
--   -> client accepts -> client shares a demand -> agency sees the shared
--   demand -> agency offers a candidate -> client sees the candidate
--   -> client revokes -> disclosure is withdrawn
--
-- DOCTRINE UNDER TEST:  CONFIDENTIALITY WITHOUT CAPTIVITY.
--   Confidentiality = a candidate identity is visible ONLY to the client that
--     holds a live connection AND a live share, and stops being visible the
--     moment either is revoked.
--   Without captivity = nothing in the model binds a worker to one agency.
--     Measured, not asserted: no captivity column exists, the same worker sits
--     on two agencies' rosters at once, and revoking one agency's client
--     connection leaves the worker's own record and the other roster intact.
--
-- WHAT THIS IS
--   A reachability probe, not a unit test. It calls the SAME production RPCs
--   the web client calls, as the SAME five actors, under the SAME RLS
--   (`set local role authenticated` plus a transaction-local
--   `request.jwt.claims` carrying `sub` AND `email` -- two of these RPCs gate
--   on the verified JWT email, so a claims blob without it would fail the
--   probe for a reason that has nothing to do with the loop).
--
-- WHY IT CANNOT LEAVE RESIDUE
--   Every write happens inside ONE transaction that ENDS IN A DELIBERATE
--   `raise exception`. The exception message IS the report. Postgres rolls the
--   whole transaction back, so this runs against production without adding a
--   row to it. (G-01 / M3 precedent.) Verify with g02-agency-loop.residue.sql.
--
-- IT WALKS THE LOOP TWICE
--   PASS 1 (`roster_bridged = false`) -- the world as it ships today: the
--     worker reaches the agency ONLY through the canonical invitation flow,
--     `invite_agency_worker` -> `accept_agency_worker_invitation`, which
--     writes `agency_workers` keyed on `agencies.id`.
--   PASS 2 (`roster_bridged = true`) -- the same walk plus ONE row in
--     `company_workers` keyed on the agency's `companies.id`.
--   The DELTA between the two passes is the finding. Disjoint synthetic
--   identities (9921* / 9922*) so neither pass can contaminate the other.
--
-- WHY THAT IS THE RIGHT DELTA
--   `agencies` and `companies WHERE company_type = 'staffing_agency'` are two
--   DISJOINT key spaces in production -- zero shared ids across all 3 of each,
--   related only by a shared `profile_id`. The roster arm keys on the former;
--   `submit_agency_candidate_offer_v1` demands the latter. Pass 2 supplies
--   exactly the one row that would bridge them, and nothing else.
--
-- STAGES ARE INDIVIDUALLY FAULT-ISOLATED
--   Each stage runs in its own BEGIN/EXCEPTION sub-block and records its own
--   SQLSTATE. A stage that fails does NOT abort the probe -- the report shows
--   how far the loop reaches and what refused it. Refused vs missing vs broken
--   is the entire point.
--
-- NEGATIVE CONTROLS ARE FIRST-CLASS
--   A confidentiality proof that only ever checks the permitted reader proves
--   nothing. Every disclosure stage is paired with a reader who must see ZERO:
--   a second client, a second agency, and the same client after revocation.
--   A control that cannot fail is worse than no control.
--
-- NAMING
--   Every local is v_-prefixed. An unprefixed `worker_id` would be resolved by
--   plpgsql as the VARIABLE inside a WHERE clause that meant the COLUMN,
--   turning `where worker_id = worker_id` into `where true` -- a probe that
--   passes by accident. For the same reason the pass counter `v_loop` is never
--   reused as a scratch counter inside a stage: a stage that overwrote it
--   would silently rewrite the loop itself.
-- ===========================================================================
do $g02$
declare
  v_mode        boolean;
  v_prefix      text;

  -- actors
  v_a_owner     uuid;   -- agency A owner
  v_client      uuid;   -- client C owner
  v_wrk         uuid;   -- worker W profile
  v_client2     uuid;   -- client C2 owner  (negative control reader)
  v_a2_owner    uuid;   -- agency A2 owner  (negative control reader)

  -- entities
  v_agency      uuid;   -- agencies.id            (roster arm, A)
  v_agency_co   uuid;   -- companies.id staffing  (client-bridge arm, A)
  v_agency2     uuid;   -- agencies.id            (roster arm, A2)
  v_agency2_co  uuid;   -- companies.id staffing  (client-bridge arm, A2)
  v_client_co   uuid;   -- companies.id           (client C)
  v_client_org  uuid;   -- organizations.id       (client C)
  v_client2_co  uuid;   -- companies.id           (client C2)
  v_client2_org uuid;   -- organizations.id       (client C2)
  v_request     uuid;   -- customer_requests.id   (owned by C)

  v_worker      uuid;   -- workers.id for W

  -- emails
  v_a_email     text;
  v_c_email     text;
  v_w_email     text;
  v_c2_email    text;
  v_a2_email    text;

  -- loop state
  v_conn        uuid;
  v_share       uuid;
  v_offer       uuid;

  v_txt         text;
  v_n           int;
  v_n2          int;
  v_n3          int;
  v_bool        boolean;

  v_pass        jsonb;
  v_report      jsonb := '[]'::jsonb;
begin
for v_loop in 1..2 loop
  v_mode   := (v_loop = 2);
  v_prefix := case when v_mode then '9922' else '9921' end;
  v_pass   := jsonb_build_object('pass', v_loop, 'roster_bridged', v_mode);

  v_a_owner     := (v_prefix || '0000-0000-4000-8000-000000000001')::uuid;
  v_client      := (v_prefix || '0000-0000-4000-8000-000000000002')::uuid;
  v_wrk         := (v_prefix || '0000-0000-4000-8000-000000000003')::uuid;
  v_client2     := (v_prefix || '0000-0000-4000-8000-000000000004')::uuid;
  v_a2_owner    := (v_prefix || '0000-0000-4000-8000-000000000005')::uuid;
  v_agency      := (v_prefix || '0000-0000-4000-8000-000000000011')::uuid;
  v_agency2     := (v_prefix || '0000-0000-4000-8000-000000000012')::uuid;
  v_agency_co   := (v_prefix || '0000-0000-4000-8000-000000000021')::uuid;
  v_client_co   := (v_prefix || '0000-0000-4000-8000-000000000022')::uuid;
  v_client2_co  := (v_prefix || '0000-0000-4000-8000-000000000023')::uuid;
  v_agency2_co  := (v_prefix || '0000-0000-4000-8000-000000000024')::uuid;
  v_client_org  := (v_prefix || '0000-0000-4000-8000-000000000031')::uuid;
  v_client2_org := (v_prefix || '0000-0000-4000-8000-000000000032')::uuid;
  v_request     := (v_prefix || '0000-0000-4000-8000-000000000041')::uuid;

  v_a_email  := 'g02-agency-'  || v_prefix || '@proof.invalid';
  v_c_email  := 'g02-client-'  || v_prefix || '@proof.invalid';
  v_w_email  := 'g02-worker-'  || v_prefix || '@proof.invalid';
  v_c2_email := 'g02-client2-' || v_prefix || '@proof.invalid';
  v_a2_email := 'g02-agency2-' || v_prefix || '@proof.invalid';

  v_conn := null; v_share := null; v_offer := null; v_worker := null;

  -- Seeding is OUT-OF-BAND, not a user action. Clear whatever identity the
  -- previous pass left in the transaction: `profiles.email` is bound to the
  -- authenticated identity, so seeding pass 2 under pass 1's leftover JWT is
  -- correctly refused with 42501. That refusal is the guard working.
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- =======================================================================
  -- S0  SEED (connecting role, RLS-bypassing).
  -- Five identities, two agencies (both arms each), two clients, one worker,
  -- one submitted demand. NOTHING the loop is supposed to produce is seeded:
  -- no roster row, no connection, no share, no offer.
  -- =======================================================================
  insert into auth.users (id, email, is_sso_user, is_anonymous,
                          raw_user_meta_data, raw_app_meta_data, aud, role)
  values (v_a_owner,  v_a_email,  false, false, '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
         (v_client,   v_c_email,  false, false, '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
         (v_wrk,      v_w_email,  false, false, '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
         (v_client2,  v_c2_email, false, false, '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'),
         (v_a2_owner, v_a2_email, false, false, '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  insert into public.profiles (id, email, full_name, locale, country)
  values (v_a_owner,  v_a_email,  'G02 Agency Owner',  'lt', 'LT'),
         (v_client,   v_c_email,  'G02 Client Owner',  'lt', 'LT'),
         (v_wrk,      v_w_email,  'G02 Worker',        'lt', 'LT'),
         (v_client2,  v_c2_email, 'G02 Client2 Owner', 'lt', 'LT'),
         (v_a2_owner, v_a2_email, 'G02 Agency2 Owner', 'lt', 'LT')
  on conflict (id) do update set email = excluded.email;

  -- The profile trigger may already have minted a worker; adopt or create.
  select w.id into v_worker from public.workers w where w.profile_id = v_wrk limit 1;
  if v_worker is null then
    insert into public.workers (profile_id, display_name) values (v_wrk, 'G02 Worker')
    returning id into v_worker;
  end if;

  -- Roster arm: `agencies`. (Insert fires mirror_agency_to_org -> organizations.)
  insert into public.agencies (id, profile_id, legal_name, country)
  values (v_agency,  v_a_owner,  'G02 Agency A UAB',  'LT'),
         (v_agency2, v_a2_owner, 'G02 Agency A2 UAB', 'LT')
  on conflict (id) do nothing;

  -- Client-bridge arm: `companies` typed staffing_agency. DISJOINT ids from
  -- the rows above -- that disjointness is production's real shape, not a
  -- convenience of this probe.
  insert into public.companies (id, profile_id, legal_name, display_name, country, company_type)
  values (v_agency_co,  v_a_owner,  'G02 Agency A UAB',  'G02 Agency A',  'LT', 'staffing_agency'),
         (v_agency2_co, v_a2_owner, 'G02 Agency A2 UAB', 'G02 Agency A2', 'LT', 'staffing_agency'),
         (v_client_co,  v_client,   'G02 Client UAB',    'G02 Client',    'LT', 'other'),
         (v_client2_co, v_client2,  'G02 Client2 UAB',   'G02 Client2',   'LT', 'other')
  on conflict (id) do nothing;

  insert into public.organizations (id, owner_profile_id, organization_type,
                                    legal_name, display_name, country, legacy_company_id)
  values (v_client_org,  v_client,  'company', 'G02 Client UAB',  'G02 Client',  'LT', v_client_co),
         (v_client2_org, v_client2, 'company', 'G02 Client2 UAB', 'G02 Client2', 'LT', v_client2_co)
  on conflict (id) do nothing;

  insert into public.company_memberships (organization_id, profile_id, role, status, accepted_at)
  values (v_client_org,  v_client,  'owner', 'active', now()),
         (v_client2_org, v_client2, 'owner', 'active', now())
  on conflict do nothing;

  insert into public.customer_requests (id, profile_id, organization_id, title,
                                        need_summary, country, status)
  values (v_request, v_client, v_client_org, 'G02 electricians needed',
          'Three electricians, one site, four weeks', 'LT', 'submitted')
  on conflict (id) do nothing;

  -- THE ONLY DIFFERENCE BETWEEN THE TWO PASSES: one row bridging the roster
  -- arm to the client-bridge arm. No DDL, no new table, no gate rewritten.
  if v_mode then
    insert into public.company_workers (company_id, worker_id, status)
    values (v_agency_co, v_worker, 'active')
    on conflict do nothing;
  end if;

  v_pass := v_pass || jsonb_build_object('S0_seed', jsonb_build_object(
        'ok', true, 'worker_id', v_worker,
        'agencies_id_equals_companies_id', (v_agency = v_agency_co)));

  -- =======================================================================
  -- S0b  GATE DIAGNOSTICS -- read the authority predicates before walking.
  -- A stage refusal is only interpretable next to the gate that produced it.
  -- =======================================================================
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_a_owner, 'email', v_a_email, 'role', 'authenticated')::text, true);
  v_pass := v_pass || jsonb_build_object('S0b_gates_agency', jsonb_build_object(
        'owns_agency_roster_arm',  public.owns_agency(v_agency),
        'owns_company_bridge_arm', public.owns_company(v_agency_co)));

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_wrk, 'email', v_w_email, 'role', 'authenticated')::text, true);
  v_pass := v_pass || jsonb_build_object('S0b_gates_worker', jsonb_build_object(
        'owns_worker', public.owns_worker(v_worker)));
  execute 'reset role';

  -- ================= S1  AGENCY INVITES WORKER ===========================
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_a_owner, 'email', v_a_email, 'role', 'authenticated')::text, true);
    select public.invite_agency_worker(v_agency, v_w_email, 'G-02 proof invite') into v_txt;
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S1_invite_worker',
          jsonb_build_object('ok', v_txt = 'invited', 'result', v_txt));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S1_invite_worker',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S2  WORKER ACCEPTS (roster arm) =====================
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_wrk, 'email', v_w_email, 'role', 'authenticated')::text, true);
    select public.accept_agency_worker_invitation(v_agency) into v_txt;
    execute 'reset role';
    select count(*) into v_n from public.agency_workers aw
     where aw.agency_id = v_agency and aw.worker_id = v_worker and aw.status = 'active';
    v_pass := v_pass || jsonb_build_object('S2_worker_joins_agency',
          jsonb_build_object('ok', v_txt = 'linked' and v_n = 1,
                             'result', v_txt, 'agency_workers_rows', v_n));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S2_worker_joins_agency',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S2b  AGENCY ASSIGNS AN OPERATIONS ROLE ==============
  -- `assign_agency_worker_role` returns a STATUS STRING; it does not raise on
  -- refusal. So the assertion must compare that string. An earlier draft of
  -- this probe asserted `v_txt is not null`, which reported ok=true while the
  -- RPC was actually answering 'invalid_role' -- a check that could not fail.
  -- The role vocabulary is closed: worker | foreman | project_manager |
  -- company_admin | agency_admin.
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_a_owner, 'email', v_a_email, 'role', 'authenticated')::text, true);
    select public.assign_agency_worker_role(v_agency, v_worker, 'foreman', 'Electrician', false)
      into v_txt;
    execute 'reset role';
    select count(*) into v_n from public.agency_workers aw
     where aw.agency_id = v_agency and aw.worker_id = v_worker
       and aw.operations_role = 'foreman';
    v_pass := v_pass || jsonb_build_object('S2b_assign_role',
          jsonb_build_object('ok', v_txt = 'assigned' and v_n = 1,
                             'result', v_txt, 'row_carries_role', v_n));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S2b_assign_role',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S2c  AGENCY MAY NOT SURVEIL THE WORKER'S JOURNAL ====
  -- A captivity property the schema enforces at the RPC: an agency cannot
  -- switch on journal review over a worker it represents. Refusal is the
  -- PASS condition here, and it is asserted on the stored row too -- a
  -- refusal string with the flag flipped anyway would be worse than no guard.
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_a_owner, 'email', v_a_email, 'role', 'authenticated')::text, true);
    select public.assign_agency_worker_role(v_agency, v_worker, 'foreman', 'Electrician', true)
      into v_txt;
    execute 'reset role';
    select count(*) into v_n from public.agency_workers aw
     where aw.agency_id = v_agency and aw.worker_id = v_worker
       and aw.journal_review_enabled is true;
    v_pass := v_pass || jsonb_build_object('S2c_journal_review_refused',
          jsonb_build_object('ok', v_txt = 'review_not_allowed' and v_n = 0,
                             'result', v_txt, 'flag_set_must_be_0', v_n));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S2c_journal_review_refused',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S3  AGENCY INVITES CLIENT ===========================
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_a_owner, 'email', v_a_email, 'role', 'authenticated')::text, true);
    select public.create_agency_client_connection_v1(v_agency_co, v_c_email) into v_conn;
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S3_invite_client',
          jsonb_build_object('ok', v_conn is not null, 'connection_id', v_conn));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S3_invite_client',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S4  CLIENT ACCEPTS ==================================
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_client, 'email', v_c_email, 'role', 'authenticated')::text, true);
    select public.accept_agency_client_connection_v1(v_conn, v_client_co) into v_txt;
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S4_client_accepts',
          jsonb_build_object('ok', v_txt = 'accepted', 'result', v_txt));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S4_client_accepts',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S5  CLIENT SHARES THE DEMAND ========================
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_client, 'email', v_c_email, 'role', 'authenticated')::text, true);
    select public.share_request_with_agency_v1(v_conn, v_request) into v_share;
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S5_client_shares_demand',
          jsonb_build_object('ok', v_share is not null, 'share_id', v_share));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S5_client_shares_demand',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S6  AGENCY SEES IT / SECOND AGENCY MUST NOT =========
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_a_owner, 'email', v_a_email, 'role', 'authenticated')::text, true);
    select count(*) into v_n from public.list_shared_requests_for_agency_v1() s
     where s.request_id = v_request;
    -- NEGATIVE CONTROL: an unrelated agency must see nothing.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_a2_owner, 'email', v_a2_email, 'role', 'authenticated')::text, true);
    select count(*) into v_n2 from public.list_shared_requests_for_agency_v1() s
     where s.request_id = v_request;
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S6_agency_sees_shared_demand',
          jsonb_build_object('ok', v_n = 1 and v_n2 = 0,
                             'agency_A_sees', v_n, 'agency_A2_sees_must_be_0', v_n2));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S6_agency_sees_shared_demand',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S7  AGENCY OFFERS A CANDIDATE  <-- THE SEAM =========
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_a_owner, 'email', v_a_email, 'role', 'authenticated')::text, true);
    select public.submit_agency_candidate_offer_v1(v_share, v_worker, 'G-02 proof offer') into v_offer;
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S7_agency_offers_candidate',
          jsonb_build_object('ok', v_offer is not null, 'offer_id', v_offer));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S7_agency_offers_candidate',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S8  CLIENT SEES THE CANDIDATE / OTHERS MUST NOT =====
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_client, 'email', v_c_email, 'role', 'authenticated')::text, true);
    select count(*) into v_n
      from public.list_agency_offered_candidates_for_request_v1(v_request) o
     where o.worker_id = v_worker;
    -- NEGATIVE CONTROL: an unrelated client must see nothing, through the RPC
    -- AND through raw RLS on the table (the RPC could be right while the
    -- policy behind it leaks).
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_client2, 'email', v_c2_email, 'role', 'authenticated')::text, true);
    select count(*) into v_n2
      from public.list_agency_offered_candidates_for_request_v1(v_request) o;
    select count(*) into v_n3 from public.agency_candidate_offers o
     where o.request_id = v_request;
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S8_client_sees_candidate',
          jsonb_build_object('ok', v_n = 1 and v_n2 = 0 and v_n3 = 0,
                             'client_C_sees', v_n,
                             'client_C2_sees_rpc_must_be_0', v_n2,
                             'client_C2_sees_rls_must_be_0', v_n3));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S8_client_sees_candidate',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S9  NO CAPTIVITY ====================================
  -- Three measured properties, not three assertions:
  --   (a) no column anywhere in the schema binds a worker to an agency;
  --   (b) the SAME worker sits on a SECOND agency's roster at the same time;
  --   (c) the worker still owns their own record while represented.
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_a2_owner, 'email', v_a2_email, 'role', 'authenticated')::text, true);
    select public.invite_agency_worker(v_agency2, v_w_email, 'G-02 second agency') into v_txt;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_wrk, 'email', v_w_email, 'role', 'authenticated')::text, true);
    select public.accept_agency_worker_invitation(v_agency2) into v_txt;
    select public.owns_worker(v_worker) into v_bool;
    execute 'reset role';

    select count(*) into v_n from public.agency_workers aw
     where aw.worker_id = v_worker and aw.status = 'active';
    select count(*) into v_n2 from information_schema.columns c
     where c.table_schema = 'public'
       and (c.column_name ilike '%owned_by_agency%' or c.column_name ilike '%exclusiv%'
            or c.column_name ilike '%captiv%' or c.column_name ilike '%locked_to%');
    v_pass := v_pass || jsonb_build_object('S9_no_captivity',
          jsonb_build_object('ok', v_n = 2 and v_n2 = 0 and v_bool,
                             'second_agency_accept', v_txt,
                             'rosters_worker_sits_on', v_n,
                             'captivity_columns_must_be_0', v_n2,
                             'worker_still_owns_own_record', v_bool));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S9_no_captivity',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S10  CLIENT REVOKES THE CONNECTION ==================
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_client, 'email', v_c_email, 'role', 'authenticated')::text, true);
    select public.revoke_agency_client_connection_v1(v_conn) into v_txt;
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S10_client_revokes',
          jsonb_build_object('ok', v_txt = 'revoked', 'result', v_txt));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S10_client_revokes',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S11  DISCLOSURE IS WITHDRAWN ========================
  -- The #1395 property: a severed client must NOT retain the candidate
  -- identity. Checked through the RPC AND through raw RLS, paired with the
  -- cascade state on the rows themselves.
  --
  -- The offer-cascade assertion is written so it CANNOT pass vacuously: if
  -- S7 never produced an offer (pass 1), `offers_cascaded_to_withdrawn` is
  -- reported but excluded from `ok` explicitly rather than silently counting
  -- 0 = 0 as a success.
  begin
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_client, 'email', v_c_email, 'role', 'authenticated')::text, true);
    select count(*) into v_n
      from public.list_agency_offered_candidates_for_request_v1(v_request) o;
    select count(*) into v_n2 from public.agency_candidate_offers o
     where o.request_id = v_request;
    execute 'reset role';

    select count(*) into v_n3 from public.agency_candidate_offers o
     where o.request_id = v_request and o.status = 'withdrawn';

    v_pass := v_pass || jsonb_build_object('S11_disclosure_withdrawn',
          jsonb_build_object(
            'ok', v_n = 0 and v_n2 = 0 and (v_offer is null or v_n3 = 1),
            'offer_existed_to_withdraw', v_offer is not null,
            'client_sees_rpc_must_be_0', v_n,
            'client_sees_rls_must_be_0', v_n2,
            'offers_cascaded_to_withdrawn', v_n3));
  exception when others then
    execute 'reset role';
    v_pass := v_pass || jsonb_build_object('S11_disclosure_withdrawn',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  -- ================= S12  REVOCATION DID NOT TOUCH THE WORKER ============
  -- Captivity's mirror image: severing the commercial relationship must not
  -- reach into the worker's own records or the other agency's roster.
  begin
    select count(*) into v_n from public.agency_workers aw
     where aw.worker_id = v_worker and aw.status = 'active';
    select count(*) into v_n2 from public.workers w where w.id = v_worker;
    select count(*) into v_n3 from public.agency_client_request_shares s
     where s.id = v_share and s.status = 'revoked';
    v_pass := v_pass || jsonb_build_object('S12_worker_untouched_by_revocation',
          jsonb_build_object('ok', v_n = 2 and v_n2 = 1,
                             'rosters_still_active', v_n,
                             'worker_record_rows', v_n2,
                             'share_cascaded_to_revoked', v_n3));
  exception when others then
    v_pass := v_pass || jsonb_build_object('S12_worker_untouched_by_revocation',
          jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM));
  end;

  v_report := v_report || v_pass;
end loop;

raise exception 'G02_REPORT %', jsonb_pretty(v_report) using errcode = 'P0001';
end;
$g02$;
