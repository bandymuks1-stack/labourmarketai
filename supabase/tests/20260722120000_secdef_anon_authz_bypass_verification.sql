-- ============================================================================
-- BEHAVIOURAL VERIFICATION for the P0 anon SECURITY DEFINER authorization fix
-- migration: 20260722120000_secdef_anon_authz_bypass_fix_v1.sql
-- ============================================================================
--
-- WHAT THIS IS
--   TEN proofs that the fix actually holds at runtime. Static guard tests
--   (apps/web/lib/guards/secdef-anon-authz-bypass.test.ts) pin the migration
--   TEXT; this script proves DATABASE BEHAVIOUR. Both are required — neither
--   substitutes for the other.
--
-- DIVISION OF LABOUR BETWEEN THE PROOFS (settled after Codex review of PR #845)
--   CATALOG proofs (no RPC call at all): 1, 2, 8, 9.
--   BEHAVIOURAL proofs (real RPC calls): 3, 4, 5, 6, 7, 10.
--   *** PROOF 10 is the ONE AND ONLY discriminating proof of the in-body
--       `auth.uid() is null` guard. *** No other proof claims to test it.
--   An `anon` caller loses EXECUTE after the migration, so any anon RPC call is
--   refused by the PRIVILEGE check and can only ever demonstrate reachability,
--   never the in-body guard. PROOF 2 therefore performs NO RPC call — it is a
--   pure catalog privilege check.
--
--   ANON REACHABILITY COVERAGE — all SEVEN functions, no gaps:
--     PROOF 6   update_marketplace_listing_v1                      (1)
--     PROOF 7   delete_proposal_v1, set_proposal_status_v1,
--               set_contract_status_v1, delete_marketplace_listing_v1,
--               delete_contract_v1                                  (5)
--     PROOF 10  set_marketplace_listing_status_v1                   (1)
--   PROOF 3 also calls delete_contract_v1, but as an authenticated NON-OWNER,
--   which is a different property — that is why PROOF 7 calls it as anon too.
--   (Coverage gap found by Codex review of PR #845: an earlier revision claimed
--   six-function coverage while actually exercising five.)
--
-- SAFETY CONTRACT — verified against the live catalog on 2026-07-22
--   * ONE transaction, ending in ROLLBACK. There is no COMMIT anywhere.
--   * NO DDL. No CREATE / ALTER / DROP / TRUNCATE / GRANT / REVOKE.
--   * NO SEQUENCES. All three tables key on `id default gen_random_uuid()`
--     (confirmed via pg_attrdef), so nothing survives the rollback the way a
--     sequence advance would.
--   * NO TRIGGERS on public.contracts / public.proposals /
--     public.marketplace_listings (confirmed via pg_trigger, excluding
--     internal FK triggers) — so no audit row, no pg_notify, no cascade.
--   * NO external side effects: no HTTP, webhook, email, queue, storage,
--     dblink, pg_notify or COPY.
--   * It writes ONLY rows it created itself, identified by ids captured in
--     local variables. It never targets an id it did not generate.
--   * public.profiles is READ-ONLY here: two existing profile ids are borrowed
--     as owner/non-owner identities and are never modified. No identity is
--     created.
--   * State is compared BEFORE and AFTER every rejected attempt that targets a
--     real row (PROOFS 3, 4, 6, 7, 10b), so a silently-succeeding call cannot
--     pass as a refusal. PROOFS 5 and 10a deliberately target a non-existent id
--     and therefore assert on the ERROR IDENTITY instead — for 10a that
--     discrimination is the whole point of the proof.
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor, or psql as a superuser/postgres role.
--   Run the ENTIRE file as one script. Read the NOTICE output.
--
-- WHEN TO RUN — AND EXACTLY WHAT TO EXPECT
--   1. BEFORE the production apply, against the VULNERABLE state:
--        EXPECTED FAIL : 1, 2, 6, 7, 8, 10
--        EXPECTED PASS : 3, 4, 5, 9
--      (3 passes because a non-NULL wrong uid still trips the old `<>` check;
--       4 passes because the owner is legitimately allowed; 5 passes because
--       the old function raises 'listing not found' for an unknown id, which
--       the predicate accepts; 9 passes because `authenticated` already holds
--       EXECUTE.)  Those six failures ARE the reproduction of the defect.
--   2. AFTER the production apply → all 10 proofs must PASS.
--   Record both outputs in the task log (AGENTS.md §Migrations (d)).
--
-- BLOCK MARKERS
--   Each proof is delimited by a unique `>>>PROOF_n_BEGIN` / `<<<PROOF_n_END`
--   marker pair so the guard test can extract an exact block instead of
--   scanning for the first occurrence of a common substring (an earlier guard
--   bug did exactly that and asserted vacuously across several proofs).

begin;

do $$
declare
  v_owner      uuid;
  v_other      uuid;
  v_contract   uuid;
  v_proposal   uuid;
  v_listing    uuid;
  v_listing10  uuid;
  v_status     text;
  v_title      text;
  v_count      int;
  v_present    int;
  v_pass       boolean;
  v_err        text;
  v_err2       text;
  v_fails      int := 0;
  -- The seven target functions, by EXACT identity signature as reported by
  -- pg_get_function_identity_arguments in production.
  k_sigs       text[] := array[
    'delete_contract_v1(p_contract_id uuid)',
    'set_contract_status_v1(p_contract_id uuid, p_status text)',
    'delete_proposal_v1(p_proposal_id uuid)',
    'set_proposal_status_v1(p_proposal_id uuid, p_status text, p_rejection_reason text)',
    'delete_marketplace_listing_v1(p_id uuid)',
    'set_marketplace_listing_status_v1(p_id uuid, p_status text)',
    'update_marketplace_listing_v1(p_id uuid, p_title text, p_category text, p_listing_kind text, p_description text, p_location_country text, p_location_label text, p_price_text text)'
  ];
begin
  -- --------------------------------------------------------------------
  -- Fixtures: two DISTINCT existing profiles. We never create identities.
  -- --------------------------------------------------------------------
  select id into v_owner from public.profiles order by id limit 1;
  select id into v_other from public.profiles where id <> v_owner order by id limit 1;

  if v_owner is null or v_other is null then
    raise exception 'SETUP FAILED: need two distinct rows in public.profiles';
  end if;

  raise notice '--- fixtures: owner=% other=% ---', v_owner, v_other;

  insert into public.contracts (owner_id, title, status)
    values (v_owner, 'P0 verification contract', 'draft')
    returning id into v_contract;

  insert into public.proposals (owner_id, title, status)
    values (v_owner, 'P0 verification proposal', 'draft')
    returning id into v_proposal;

  insert into public.marketplace_listings
      (owner_id, listing_kind, category, title, status)
    values (v_owner, 'sale', 'tools', 'P0 verification listing', 'draft')
    returning id into v_listing;

  -- >>>PROOF_1_BEGIN
  -- PROOF 1 — CATALOG. No function matched by NAME is anon-executable.
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('delete_contract_v1','set_contract_status_v1',
                      'delete_proposal_v1','set_proposal_status_v1',
                      'delete_marketplace_listing_v1',
                      'set_marketplace_listing_status_v1',
                      'update_marketplace_listing_v1')
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  v_pass := (v_count = 0);
  if not v_pass then v_fails := v_fails + 1; end if;
  raise notice 'PROOF 1  (no anon EXECUTE, matched by name)        = %  [anon-executable: %]',
    case when v_pass then 'PASS' else 'FAIL' end, v_count;
  -- <<<PROOF_1_END

  -- >>>PROOF_2_BEGIN
  -- PROOF 2 — CATALOG, BY EXACT IDENTITY SIGNATURE.
  --
  --   THIS PROOF PERFORMS NO RPC CALL, BY DESIGN.
  --   After the migration `anon` has no EXECUTE, so an anon RPC call is refused
  --   by the privilege check and never enters the function body; it could only
  --   ever demonstrate reachability. Testing the in-body guard is PROOF 10's
  --   job, and PROOF 10's alone. An earlier revision of this proof did issue an
  --   anon call, which duplicated PROOF 10's subject without its discriminating
  --   power; the call has been removed rather than re-explained.
  --
  --   What this adds over PROOF 1: PROOF 1 matches by NAME, so an overload with
  --   a different argument list would escape it. This resolves each of the
  --   seven EXACT signatures and additionally asserts that all seven still
  --   exist — so a typo or a signature change cannot make the proof pass
  --   vacuously.
  select count(*) into v_present
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') = any (k_sigs);

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') = any (k_sigs)
    and has_function_privilege('anon', p.oid, 'EXECUTE');

  v_pass := (v_present = 7) and (v_count = 0);
  if not v_pass then v_fails := v_fails + 1; end if;
  raise notice 'PROOF 2  (no anon EXECUTE, by exact signature)     = %  [signatures found: %/7, anon-executable: %]',
    case when v_pass then 'PASS' else 'FAIL' end, v_present, v_count;
  -- <<<PROOF_2_END

  -- >>>PROOF_3_BEGIN
  -- PROOF 3 — BEHAVIOURAL. An authenticated NON-OWNER cannot UPDATE or DELETE.
  select status into v_status from public.marketplace_listings where id = v_listing;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    perform public.set_marketplace_listing_status_v1(v_listing, 'closed');
    v_err := 'NO_ERROR';
  exception when others then
    v_err := sqlstate;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select status into v_title from public.marketplace_listings where id = v_listing;

  select count(*) into v_count from public.contracts where id = v_contract;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    perform public.delete_contract_v1(v_contract);
  exception when others then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  v_pass := (v_err <> 'NO_ERROR')
        and (v_title = v_status)
        and ((select count(*) from public.contracts where id = v_contract) = v_count);
  if not v_pass then v_fails := v_fails + 1; end if;
  raise notice 'PROOF 3  (non-owner cannot UPDATE/DELETE)          = %  [err=% status: %->% contract_rows=%]',
    case when v_pass then 'PASS' else 'FAIL' end, v_err, v_status, v_title,
    (select count(*) from public.contracts where id = v_contract);
  -- <<<PROOF_3_END

  -- >>>PROOF_4_BEGIN
  -- PROOF 4 — BEHAVIOURAL. The LEGITIMATE OWNER can still act (no regression).
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    perform public.set_marketplace_listing_status_v1(v_listing, 'active');
    v_err := 'NO_ERROR';
  exception when others then
    v_err := sqlstate || ' ' || left(sqlerrm, 80);
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  select status into v_title from public.marketplace_listings where id = v_listing;
  v_pass := (v_err = 'NO_ERROR') and (v_title = 'active');
  if not v_pass then v_fails := v_fails + 1; end if;
  raise notice 'PROOF 4  (owner CAN act — no functional regression)= %  [err=% status=%]',
    case when v_pass then 'PASS' else 'FAIL' end, v_err, v_title;
  -- <<<PROOF_4_END

  -- >>>PROOF_5_BEGIN
  -- PROOF 5 — BEHAVIOURAL. A non-existent id is never answered as authorized.
  begin
    set local role anon;
    perform public.set_marketplace_listing_status_v1(gen_random_uuid(), 'closed');
    v_err := 'NO_ERROR';
  exception when others then
    v_err := sqlstate;
  end;
  reset role;
  v_pass := (v_err <> 'NO_ERROR');
  if not v_pass then v_fails := v_fails + 1; end if;
  raise notice 'PROOF 5  (unknown id not treated as authorized)    = %  [err=%]',
    case when v_pass then 'PASS' else 'FAIL' end, v_err;
  -- <<<PROOF_5_END

  -- >>>PROOF_6_BEGIN
  -- PROOF 6 — BEHAVIOURAL. Field-level content is unchanged after a rejected
  --           UPDATE. Covers update_marketplace_listing_v1's write path, which
  --           no other proof touches.
  select title into v_status from public.marketplace_listings where id = v_listing;
  begin
    set local role anon;
    perform public.update_marketplace_listing_v1(
      v_listing, 'HIJACKED TITLE', 'tools', 'sale', null, null, null, null);
  exception when others then null;
  end;
  reset role;
  select title into v_title from public.marketplace_listings where id = v_listing;
  v_pass := (v_title = v_status);
  if not v_pass then v_fails := v_fails + 1; end if;
  raise notice 'PROOF 6  (content unchanged after rejection)       = %  [title: % -> %]',
    case when v_pass then 'PASS' else 'FAIL' end, v_status, v_title;
  -- <<<PROOF_6_END

  -- >>>PROOF_7_BEGIN
  -- PROOF 7 — BEHAVIOURAL. Anon reachability of the FIVE functions not covered
  --           by PROOF 6 (update_) or PROOF 10 (set_marketplace_listing_status_).
  --           Together the three proofs call all SEVEN as anon. This is a
  --           distinct property from the in-body guard (PROOF 10) — it asserts
  --           that no anon caller reaches these write paths at all.
  --
  --           `delete_contract_v1` is included here deliberately: it is the one
  --           function PROOF 3 exercises only as an authenticated NON-OWNER, so
  --           without this call there would be no anon coverage for it at all.
  v_pass := true;
  begin set local role anon; perform public.delete_proposal_v1(v_proposal);
    v_pass := false; exception when others then null; end;
  reset role;
  begin set local role anon; perform public.set_proposal_status_v1(v_proposal, 'sent', null);
    v_pass := false; exception when others then null; end;
  reset role;
  begin set local role anon; perform public.set_contract_status_v1(v_contract, 'active');
    v_pass := false; exception when others then null; end;
  reset role;
  begin set local role anon; perform public.delete_marketplace_listing_v1(v_listing);
    v_pass := false; exception when others then null; end;
  reset role;
  begin set local role anon; perform public.delete_contract_v1(v_contract);
    v_pass := false; exception when others then null; end;
  reset role;
  -- coalesce(): if an anon DELETE succeeded, the scalar subqueries below return
  -- NULL, `NULL = 'draft'` is NULL, and `if not NULL` is NOT true — the failure
  -- would print FAIL but never increment v_fails, so the summary could still
  -- announce "ALL 10 PROOFS PASS". Force NULL to false.
  v_pass := coalesce(v_pass
        and (select count(*) from public.proposals where id = v_proposal) = 1
        and (select count(*) from public.marketplace_listings where id = v_listing) = 1
        and (select count(*) from public.contracts where id = v_contract) = 1
        and (select status from public.proposals where id = v_proposal) = 'draft'
        and (select status from public.contracts where id = v_contract) = 'draft', false);
  if not v_pass then v_fails := v_fails + 1; end if;
  raise notice 'PROOF 7  (other 5 RPCs refuse anon; rows intact)   = %  [contracts=% proposals=% listings=%]',
    case when v_pass then 'PASS' else 'FAIL' end,
    (select count(*) from public.contracts where id = v_contract),
    (select count(*) from public.proposals where id = v_proposal),
    (select count(*) from public.marketplace_listings where id = v_listing);
  -- <<<PROOF_7_END

  -- >>>PROOF_8_BEGIN
  -- PROOF 8 — CATALOG. No PUBLIC or anon entry in any of the seven ACLs.
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('delete_contract_v1','set_contract_status_v1',
                      'delete_proposal_v1','set_proposal_status_v1',
                      'delete_marketplace_listing_v1',
                      'set_marketplace_listing_status_v1',
                      'update_marketplace_listing_v1')
    and (array_to_string(coalesce(p.proacl, '{}'), ',') like '=X/%'
      or array_to_string(coalesce(p.proacl, '{}'), ',') like '%,=X/%'
      or array_to_string(coalesce(p.proacl, '{}'), ',') like '%anon=X%');
  v_pass := (v_count = 0);
  if not v_pass then v_fails := v_fails + 1; end if;
  raise notice 'PROOF 8  (no PUBLIC/anon entry in the 7 ACLs)      = %  [offending: %]',
    case when v_pass then 'PASS' else 'FAIL' end, v_count;
  -- <<<PROOF_8_END

  -- >>>PROOF_9_BEGIN
  -- PROOF 9 — CATALOG. `authenticated` retains EXECUTE on all seven.
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('delete_contract_v1','set_contract_status_v1',
                      'delete_proposal_v1','set_proposal_status_v1',
                      'delete_marketplace_listing_v1',
                      'set_marketplace_listing_status_v1',
                      'update_marketplace_listing_v1')
    and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  v_pass := (v_count = 7);
  if not v_pass then v_fails := v_fails + 1; end if;
  raise notice 'PROOF 9  (authenticated keeps EXECUTE on all 7)    = %  [granted: %/7]',
    case when v_pass then 'PASS' else 'FAIL' end, v_count;
  -- <<<PROOF_9_END

  -- >>>PROOF_10_BEGIN
  -- PROOF 10 — THE ONLY DISCRIMINATING PROOF OF THE IN-BODY NULL GUARD.
  --
  -- It calls through a role that CAN execute (`authenticated`) with the JWT
  -- identity UNSET, so auth.uid() is NULL and the guard is the only barrier.
  -- auth.uid() is `coalesce(nullif(current_setting('request.jwt.claim.sub',
  -- true),''), (nullif(current_setting('request.jwt.claims', true),'')::jsonb
  -- ->> 'sub'))::uuid` — an empty setting is safely NULL.
  --
  -- TWO parts, because "an exception was raised" is not enough:
  --   10a  a MISSING id, asserting WHICH error is raised. Without this, the
  --        proof would still pass if the explicit guard were deleted, because
  --        `v_owner is distinct from NULL` is TRUE and raises 'not authorized'
  --        anyway.
  --            guard PRESENT -> 'not authorized'    (raised BEFORE the lookup)
  --            guard ABSENT  -> 'listing not found' (the lookup ran first)
  --        Using a missing id also makes 10a independent of every fixture.
  --   10b  a REAL row from its OWN fresh fixture, asserting unchanged state.
  --        The fixture is created here because in the VULNERABLE pre-apply run
  --        PROOF 7 really does delete v_listing as anon.
  --
  -- Pre-apply BOTH fail; post-apply both must raise 'not authorized' with the
  -- row untouched.
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform public.set_marketplace_listing_status_v1(gen_random_uuid(), 'closed');
    v_err := 'NO_ERROR';
  exception when others then
    v_err := sqlerrm;
  end;
  reset role;

  insert into public.marketplace_listings
      (owner_id, listing_kind, category, title, status)
    values (v_owner, 'sale', 'tools', 'P0 verification listing 10', 'draft')
    returning id into v_listing10;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform public.set_marketplace_listing_status_v1(v_listing10, 'closed');
    v_err2 := 'NO_ERROR';
  exception when others then
    v_err2 := sqlerrm;
  end;
  reset role;
  select status into v_title from public.marketplace_listings where id = v_listing10;

  v_pass := (v_err = 'not authorized')
        and (v_err2 = 'not authorized')
        and (v_title = 'draft');
  if not v_pass then v_fails := v_fails + 1; end if;
  raise notice 'PROOF 10 (NULL guard fires BEFORE the owner lookup)= %  [missing-id err=% | real-row err=% status=%]',
    case when v_pass then 'PASS' else 'FAIL' end, v_err, v_err2, v_title;
  -- <<<PROOF_10_END

  raise notice '=====================================================';
  if v_fails = 0 then
    raise notice 'RESULT: ALL 10 PROOFS PASS';
  else
    raise notice 'RESULT: % PROOF(S) FAILED — DO NOT PROCEED', v_fails;
  end if;
  raise notice '=====================================================';
end $$;

-- Everything above is discarded. The counts below confirm it left nothing.
rollback;

-- Post-run confirmation — expected: the three counts are unchanged from before.
select 'contracts' as t, count(*) from public.contracts
union all select 'proposals', count(*) from public.proposals
union all select 'marketplace_listings', count(*) from public.marketplace_listings;
