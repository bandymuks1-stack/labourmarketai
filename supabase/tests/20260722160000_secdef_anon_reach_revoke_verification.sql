-- =====================================================================
-- Verification harness for 20260722160000_secdef_anon_reach_revoke_v1.sql
--
-- Run it TWICE and record BOTH runs:
--   * BEFORE the apply — expect PROOF 1 and PROOF 6 to FAIL (that failure is
--     the defect being reproduced; 43 functions are anon-reachable).
--   * AFTER the apply  — expect ALL proofs to PASS.
--
-- A verification that was never run against the unauthenticated case is exactly
-- what let the 2026-07-22 P0 ship. Do not accept a single post-apply run.
--
-- TRANSPORT NOTE (learned the hard way on PR #846)
-- ------------------------------------------------
-- This harness reports through a RESULT SET, not `raise notice`. The Supabase
-- MCP `execute_sql` channel discards notices, which previously forced a one-off
-- read-back wrapper to be hand-written at the owner gate. Sending this whole
-- file as one multi-statement query returns the final SELECT, so the harness
-- that ships is the harness that runs.
--
-- Everything happens inside a transaction that ends in ROLLBACK. It writes
-- nothing. Safe against production.
-- =====================================================================

begin;

create temporary table _verdict (
  seq      integer,
  proof    text,
  status   text,
  detail   text
) on commit drop;

-- The reviewed allowlist. Exact identity signatures, never a count.
create temporary view _allowlist as
select unnest(array[
  'get_public_business_profile_v1(p_slug text)',
  'get_public_business_listings_v1(p_org_id uuid)',
  'get_public_business_services_v1(p_org_id uuid)',
  'submit_company_need_public_v1(p_locale text, p_company_name text, p_contact_name text, p_contact_email text, p_contact_phone text, p_country text, p_city_region text, p_sector text, p_headcount integer, p_start_window text, p_expected_duration text, p_urgency text, p_accommodation text, p_transport_needed boolean, p_languages text, p_engagement_type text, p_description text, p_source_path text)'
]) as sig;

create temporary view _anon_reachable as
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
       p.oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosecdef
   and has_function_privilege('anon', p.oid, 'EXECUTE');

-- ---------------------------------------------------------------------
-- PROOF 1 — no non-allowlisted SECURITY DEFINER function is anon-reachable.
--           This is the whole point of the migration.
-- ---------------------------------------------------------------------
insert into _verdict
select 1, 'no non-allowlisted function is anon-reachable',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       case when count(*) = 0 then 'none'
            else count(*) || ' leaked: ' || string_agg(sig, ', ' order by sig) end
  from (select sig from _anon_reachable except select sig from _allowlist) s;

-- ---------------------------------------------------------------------
-- PROOF 2 — every allowlisted RPC is STILL anon-reachable. Catches the
--           opposite failure: a revoke that quietly broke the public product.
-- ---------------------------------------------------------------------
insert into _verdict
select 2, 'all 4 allowlisted RPCs remain anon-callable',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       case when count(*) = 0 then 'all present'
            else 'BROKEN: ' || string_agg(sig, ', ' order by sig) end
  from (select sig from _allowlist except select sig from _anon_reachable) s;

-- ---------------------------------------------------------------------
-- PROOF 3 — the allowlist has not drifted from the catalog. A renamed or
--           re-signatured function must not silently satisfy PROOF 2.
-- ---------------------------------------------------------------------
insert into _verdict
select 3, 'allowlist entries all exist in the catalog',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       case when count(*) = 0 then 'no stale entries'
            else 'stale: ' || string_agg(a.sig, ', ' order by a.sig) end
  from _allowlist a
 where not exists (
   select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = a.sig
 );

-- ---------------------------------------------------------------------
-- PROOF 4 — no leftover default PUBLIC grant on ANY SECURITY DEFINER function
--           in public except the allowlisted ones. The default PUBLIC grant is
--           the root cause of the original P0, not a side effect of it.
-- ---------------------------------------------------------------------
insert into _verdict
select 4, 'no leftover PUBLIC (=X) grant outside the allowlist',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       case when count(*) = 0 then 'none'
            else count(*) || ' with PUBLIC: ' || string_agg(sig, ', ' order by sig) end
  from (
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and (p.proacl is null or array_to_string(p.proacl::text[], ' ') ~ '(^|[{ ])=X')
  ) s
 where s.sig not in (select sig from _allowlist);

-- ---------------------------------------------------------------------
-- PROOF 5 — the authenticated product surface is intact. If this fails the
--           migration is an outage: every RLS policy calling a revoked helper
--           would stop evaluating for logged-in users.
-- ---------------------------------------------------------------------
insert into _verdict
select 5, 'authenticated retains EXECUTE on all 43 revoked functions',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       case when count(*) = 0 then 'all 43 intact'
            else 'LOST: ' || string_agg(sig, ', ' order by sig) end
  from (
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) s
 where s.sig not in (select sig from _allowlist);

-- ---------------------------------------------------------------------
-- PROOF 6 — BEHAVIOURAL. Actually become `anon` and call three of the revoked
--           functions. Catalog agreement is not the same as the server saying
--           no. Expect 42501 (insufficient_privilege) on each.
-- ---------------------------------------------------------------------
do $$
declare
  v_state text;
  v_fail  integer := 0;
  v_detail text := '';
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);

  begin
    perform public.is_admin();
    v_fail := v_fail + 1; v_detail := v_detail || 'is_admin=REACHABLE ';
  exception when insufficient_privilege then v_detail := v_detail || 'is_admin=42501 ';
            when others then get stacked diagnostics v_state = returned_sqlstate;
                             v_fail := v_fail + 1;
                             v_detail := v_detail || 'is_admin=UNEXPECTED_' || v_state || ' ';
  end;

  begin
    perform public.owns_company('00000000-0000-0000-0000-000000000000'::uuid);
    v_fail := v_fail + 1; v_detail := v_detail || 'owns_company=REACHABLE ';
  exception when insufficient_privilege then v_detail := v_detail || 'owns_company=42501 ';
            when others then get stacked diagnostics v_state = returned_sqlstate;
                             v_fail := v_fail + 1;
                             v_detail := v_detail || 'owns_company=UNEXPECTED_' || v_state || ' ';
  end;

  begin
    perform public.create_contract_v1('PROBE', 0, null, null, null, null, null, null, null, null);
    v_fail := v_fail + 1; v_detail := v_detail || 'create_contract_v1=REACHABLE ';
  exception when insufficient_privilege then v_detail := v_detail || 'create_contract_v1=42501 ';
            when others then get stacked diagnostics v_state = returned_sqlstate;
                             v_fail := v_fail + 1;
                             v_detail := v_detail || 'create_contract_v1=UNEXPECTED_' || v_state || ' ';
  end;

  perform set_config('role', 'postgres', true);

  insert into _verdict values (
    6, 'anon is refused at the server on a live sample of 3',
    case when v_fail = 0 then 'PASS' else 'FAIL' end, trim(v_detail));
end $$;

-- ---------------------------------------------------------------------
-- PROOF 7 — BEHAVIOURAL. The intentionally-public read path still works for a
--           genuinely anonymous caller. Zero rows is a PASS (no org has
--           published a profile); a privilege error is a FAIL.
-- ---------------------------------------------------------------------
do $$
declare
  v_state text;
  v_n     integer;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);

  begin
    select count(*) into v_n
      from public.get_public_business_profile_v1('__verification_probe_slug__');
    perform set_config('role', 'postgres', true);
    insert into _verdict values (
      7, 'public business-profile RPC still serves anon', 'PASS',
      'returned ' || v_n || ' row(s) without a privilege error');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    insert into _verdict values (
      7, 'public business-profile RPC still serves anon', 'FAIL',
      'sqlstate ' || v_state);
  end;
end $$;

-- ---------------------------------------------------------------------
-- PROOF 8 — the public intake table stays sealed. `submit_company_need_public_v1`
--           is only safe because a submitter cannot read the table back.
-- ---------------------------------------------------------------------
insert into _verdict
select 8, 'company_need_public_intakes unreadable by anon',
       case when not has_table_privilege('anon', 'public.company_need_public_intakes', 'SELECT')
                 and c.relrowsecurity
            then 'PASS' else 'FAIL' end,
       'anon_select=' || has_table_privilege('anon', 'public.company_need_public_intakes', 'SELECT')
         || ' rls_enabled=' || c.relrowsecurity
         || ' policies=' || (select count(*) from pg_policy where polrelid = c.oid)
  from pg_class c
 where c.oid = 'public.company_need_public_intakes'::regclass;

-- ---------------------------------------------------------------------
-- Harness integrity, then the report.
-- ---------------------------------------------------------------------
insert into _verdict
select 0, 'HARNESS',
       case when count(*) = 8 and count(distinct seq) = 8
                 and count(*) filter (where status is null) = 0
            then 'OK' else 'BROKEN' end,
       count(*) || ' verdicts, ' || count(*) filter (where status = 'FAIL') || ' FAIL'
  from _verdict where seq > 0;

select seq, proof, status, detail from _verdict order by seq;

rollback;
