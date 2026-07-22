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
-- WHEN TO RUN
--   1. BEFORE the production apply → proofs 1–7 are EXPECTED TO FAIL on the
--      vulnerable functions and proof 8 is EXPECTED TO FAIL. That failure is the
--      reproduction of the defect.
--   2. AFTER the production apply → every proof must PASS.
--   Record both outputs in the task log (AGENTS.md §Migrations (d)).

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
  -- PROOF 2 — an unauthenticated caller (auth.uid() IS NULL) cannot bypass.
  --           This is the exact defect. State is compared before/after.
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
  raise notice 'PROOF 2 (anon cannot mutate; state unchanged)     = %  [err=% status: %->%]',
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

  -- --------------------------------------------------------------------
  raise notice '=====================================================';
  if v_fails = 0 then
    raise notice 'RESULT: ALL 9 PROOFS PASS';
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
