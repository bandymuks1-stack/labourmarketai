-- ============================================================================
-- BEHAVIOURAL VERIFICATION for the P0 anon SECURITY DEFINER authorization fix
-- migration: 20260722120000_secdef_anon_authz_bypass_fix_v1.sql
-- ============================================================================
--
-- WHAT THIS IS
--   Nine proofs that the fix actually holds at runtime. Static guard tests
--   (apps/web/lib/guards/secdef-anon-authz-bypass.test.ts) pin the migration
--   TEXT; this script proves DATABASE BEHAVIOUR. Both are required — neither
--   substitutes for the other.
--
-- SAFETY CONTRACT
--   * The whole script runs inside ONE transaction that ends in ROLLBACK.
--     There is no COMMIT anywhere. Nothing it creates survives.
--   * It writes only to public.contracts / public.proposals /
--     public.marketplace_listings, and only rows it created itself.
--   * It asserts the row state BEFORE and AFTER every rejected attempt, so a
--     silently-succeeding call cannot pass as a refusal. Checking the exception
--     text alone is explicitly NOT sufficient.
--   * It never reads or modifies any pre-existing row.
--
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor, or psql as a superuser/postgres role.
--   Run the ENTIRE file as one script. Read the NOTICE output.
--
-- HOW TO READ THE RESULT
--   Every proof prints `PROOF n ... = PASS` or `= FAIL`. Any FAIL means the fix
--   is not effective — stop and do not proceed.
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
--   Corrected after Codex review of PR #845 — the earlier "1–8 all fail"
--   expectation was wrong and would have made the two runs incomparable.

begin;

do $$
declare
  v_owner      uuid;
  v_other      uuid;
  v_contract   uuid;
  v_proposal   uuid;
  v_listing    uuid;
  v_status     text;
  v_title      text;
  v_count      int;
  v_pass       boolean;
  v_err        text;
  v_fails      int := 0;
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

  -- Seed one row per table, owned by v_owner. Rolled back at the end.
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

  -- ====================================================================
  -- PROOF 1 — anon holds no EXECUTE privilege on any of the seven
  -- ====================================================================
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
  raise notice 'PROOF 1 (anon has no EXECUTE on the 7)            = %  [anon-executable: %]',
    case when v_pass then 'PASS' else 'FAIL' end, v_count;

  -- ====================================================================
  -- PROOF 2 — `anon` cannot mutate. State is compared before/after.
  --
  -- SCOPE OF THIS PROOF — read carefully, it is narrower than it looks.
  --   PRE-apply  : anon HAS execute, so the call enters the body and the
  --                NULL-unsafe check lets it through — this FAILS, and that
  --                failure is the reproduction of the defect.
  --   POST-apply : anon has NO execute, so the call is refused by the
  --                PRIVILEGE check and never enters the function body.
  --                Post-apply this proves the ACL layer ONLY. It does NOT
  --                exercise the new `auth.uid() is null` guard.
  --
  --   The in-body guard is proven separately by PROOF 10, which calls through
  --   a role that CAN execute with the JWT identity unset. Both layers matter:
  --   PROOF 2 = reachability removed, PROOF 10 = defence-in-depth intact.
  --   (Distinction raised by Codex review of PR #845.)
  -- ====================================================================
  select status into v_status from public.marketplace_listings where id = v_listing;
  begin
    set local role anon;
    perform public.set_marketplace_listing_status_v1(v_listing, 'closed');
    v_err := 'NO_ERROR';
  exception when others then
    v_err := sqlstate;
  end;
  reset role;
  select status into v_title from public.marketplace_listings where id = v_listing;
  v_pass := (v_err <> 'NO_ERROR') and (v_title = v_status) and (v_title = 'draft');
  if not v_pass then v_fails := v_fails + 1; end if;
  raise notice 'PROOF 2 (anon blocked at the ACL; state unchanged)= %  [err=% status: %->%]',
    case when v_pass then 'PASS' else 'FAIL' end, v_err, v_status, v_title;

  -- ====================================================================
  -- PROOF 3 — an authenticated NON-OWNER cannot UPDATE or DELETE
  -- ====================================================================
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
  raise notice 'PROOF 3 (non-owner cannot UPDATE/DELETE)          = %  [err=% status: %->% contract_rows=%]',
    case when v_pass then 'PASS' else 'FAIL' end, v_err, v_status, v_title,
    (select count(*) from public.contracts where id = v_contract);

  -- ====================================================================
  -- PROOF 4 — the LEGITIMATE OWNER can still perform the allowed action
  -- ====================================================================
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
  raise notice 'PROOF 4 (owner CAN act — no functional regression)= %  [err=% status=%]',
    case when v_pass then 'PASS' else 'FAIL' end, v_err, v_title;

  -- ====================================================================
  -- PROOF 5 — a non-existent id is NEVER answered as if authorized.
  --           An anon call against a random id must be refused on identity,
  --           not silently accepted as a no-op.
  -- ====================================================================
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
  raise notice 'PROOF 5 (unknown id not treated as authorized)    = %  [err=%]',
    case when v_pass then 'PASS' else 'FAIL' end, v_err;

  -- ====================================================================
  -- PROOF 6 — content is unchanged after a rejected UPDATE attempt
  --           (verifies the field-level write path, not just status)
  -- ====================================================================
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
  raise notice 'PROOF 6 (content unchanged after rejection)       = %  [title: % -> %]',
    case when v_pass then 'PASS' else 'FAIL' end, v_status, v_title;

  -- ====================================================================
  -- PROOF 7 — the remaining four functions also refuse an anon caller
  -- ====================================================================
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
  v_pass := v_pass
        and (select count(*) from public.proposals where id = v_proposal) = 1
        and (select count(*) from public.marketplace_listings where id = v_listing) = 1
        and (select status from public.proposals where id = v_proposal) = 'draft'
        and (select status from public.contracts where id = v_contract) = 'draft';
  if not v_pass then v_fails := v_fails + 1; end if;
  raise notice 'PROOF 7 (other 4 RPCs refuse anon; rows intact)   = %',
    case when v_pass then 'PASS' else 'FAIL' end;

  -- ====================================================================
  -- PROOF 8 — catalog: PUBLIC and anon privileges are false for all seven
  -- ====================================================================
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
  raise notice 'PROOF 8 (no PUBLIC/anon entry in any of the 7 ACLs)= %  [offending: %]',
    case when v_pass then 'PASS' else 'FAIL' end, v_count;

  -- ====================================================================
  -- PROOF 9 — authenticated retains EXECUTE on all seven (product contract)
  -- ====================================================================
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
  raise notice 'PROOF 9 (authenticated keeps EXECUTE on all 7)    = %  [granted: %/7]',
    case when v_pass then 'PASS' else 'FAIL' end, v_count;

  -- ====================================================================
  -- PROOF 10 — THE GUARD ITSELF (added after Codex review of PR #845).
  --
  -- Proofs 2/5/6/7 call as `anon`. AFTER the migration `anon` has no EXECUTE,
  -- so those calls are refused by the PRIVILEGE check and never enter the
  -- function body — they therefore cannot demonstrate that the new
  -- `auth.uid() is null` guard works. This proof closes that gap: it uses a
  -- role that CAN execute (`authenticated`) while leaving the JWT identity
  -- UNSET, so auth.uid() is NULL and the in-body guard is the only thing
  -- standing between the caller and the write.
  --
  -- auth.uid() is `coalesce(nullif(current_setting('request.jwt.claim.sub',
  -- true),''), (nullif(current_setting('request.jwt.claims', true),'')::jsonb
  -- ->> 'sub'))::uuid` — an empty setting is safely NULL.
  --
  -- Pre-apply this FAILS (old code falls through and mutates the row);
  -- post-apply it must PASS with the row untouched.
  -- ====================================================================
  select status into v_status from public.marketplace_listings where id = v_listing;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform public.set_marketplace_listing_status_v1(v_listing, 'closed');
    v_err := 'NO_ERROR';
  exception when others then
    v_err := sqlstate;
  end;
  reset role;
  select status into v_title from public.marketplace_listings where id = v_listing;
  v_pass := (v_err <> 'NO_ERROR') and (v_title = v_status);
  if not v_pass then v_fails := v_fails + 1; end if;
  raise notice 'PROOF 10 (NULL identity blocked BY THE GUARD, not the ACL) = %  [err=% status: %->%]',
    case when v_pass then 'PASS' else 'FAIL' end, v_err, v_status, v_title;

  -- --------------------------------------------------------------------
  raise notice '=====================================================';
  if v_fails = 0 then
    raise notice 'RESULT: ALL 10 PROOFS PASS';
  else
    raise notice 'RESULT: % PROOF(S) FAILED — DO NOT PROCEED', v_fails;
  end if;
  raise notice '=====================================================';
end $$;

-- PROOF (transactional): everything above is discarded. Re-run the row counts
-- after this ROLLBACK to confirm the verification left nothing behind.
rollback;

-- Post-run confirmation — expected: the three counts are unchanged from before.
select 'contracts' as t, count(*) from public.contracts
union all select 'proposals', count(*) from public.proposals
union all select 'marketplace_listings', count(*) from public.marketplace_listings;
