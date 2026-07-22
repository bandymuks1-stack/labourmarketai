-- =====================================================================
-- Verification harness for 20260722160000_secdef_anon_reach_revoke_v1.sql
--
-- Run it TWICE and record BOTH runs:
--   * BEFORE the apply — PROOF 1, 4 and 9 must FAIL (43 functions anon-reachable
--     and PUBLIC-granted; trigger/dead functions still granted). That failure IS
--     the current defect being reproduced.
--   * AFTER the apply  — ALL proofs must PASS.
--
-- A verification that never tested the unauthenticated case is exactly what let
-- the 2026-07-22 P0 ship. Do not accept a post-apply-only run.
--
-- TRANSPORT NOTE (learned on PR #846, then corrected by actually testing it)
-- ------------------------------------------------------------------------
-- This harness reports through a RESULT SET, not `raise notice`, because the
-- Supabase MCP `execute_sql` channel discards notices — that is what forced a
-- one-off read-back wrapper to be hand-written at the #846 owner gate.
--
-- HOW TO RUN IT, precisely:
--
--   * PART A (catalog proofs 1-5, 8-10) is a SINGLE self-contained statement.
--     It runs anywhere, including through Supabase MCP `execute_sql`. This is
--     the part used at the owner gate, and it is the part that ships.
--
--   * PART B (behavioural proofs 6-7) uses DO blocks and `set_config`, and
--     needs a session-capable client such as `psql -f`. VERIFIED: the MCP
--     channel cannot run this file as one multi-statement script — temp tables
--     and DO blocks in the same submission fail with 42601. An earlier draft of
--     this header claimed otherwise; that claim was wrong and is corrected here
--     rather than quietly left in place.
--
-- SIGNATURE RESOLUTION: functions are resolved by JOINING pg_proc on the
-- identity string, never by casting to `regprocedure`. `regprocedure` input
-- accepts ARGUMENT TYPES ONLY — `public.owns_company(uuid)` parses,
-- `public.owns_company(c uuid)` raises 42601 `invalid type name`. The signatures
-- pinned here are in `pg_get_function_identity_arguments` form (name + type), so
-- a regprocedure cast would break every proof that touches them. This defect was
-- present in the first draft of BOTH this harness and the migration, and was
-- caught only because the owner gate mandates a pre-apply run.
--
-- Everything runs inside a transaction that ends in ROLLBACK. It writes nothing.
-- Safe against production.
-- =====================================================================

begin;

create temporary table _verdict (
  seq integer, proof text, status text, detail text
) on commit drop;

-- The reviewed allowlist. Exact identity signatures, never a count.
create temporary view _allowlist as
select unnest(array[
  'get_public_business_profile_v1(p_slug text)',
  'get_public_business_listings_v1(p_org_id uuid)',
  'get_public_business_services_v1(p_org_id uuid)',
  'submit_company_need_public_v1(p_locale text, p_company_name text, p_contact_name text, p_contact_email text, p_contact_phone text, p_country text, p_city_region text, p_sector text, p_headcount integer, p_start_window text, p_expected_duration text, p_urgency text, p_accommodation text, p_transport_needed boolean, p_languages text, p_engagement_type text, p_description text, p_source_path text)'
]) as sig;

-- The 43 in scope, each tagged with its approved post-state group.
create temporary view _scope as
select sig, grp from (values
  ('acknowledge_asset_assignment_v1(p_assignment_id uuid)','AUTHED'),
  ('add_defect_correction_v1(p_defect_id uuid, p_work_performed text, p_materials text, p_outcome text, p_completed_at date)','AUTHED'),
  ('add_project_stage_v1(p_project_id uuid, p_name text, p_stage_order integer, p_planned_start date, p_planned_end date, p_completion_criteria text)','AUTHED'),
  ('asset_open_assignment_for_caller(p_asset_id uuid)','AUTHED'),
  ('caller_manages_asset(p_asset_id uuid)','AUTHED'),
  ('caller_manages_defect(p_defect_id uuid)','AUTHED'),
  ('can_access_match(m uuid)','AUTHED'),
  ('cancel_worker_absence_v1(p_absence_id uuid)','AUTHED'),
  ('create_asset_v1(p_organization_id uuid, p_asset_type text, p_name text, p_serial_or_reg text, p_condition text, p_note text)','AUTHED'),
  ('create_contract_v1(p_title text, p_value_cents bigint, p_proposal_id uuid, p_project_id uuid, p_customer_request_id uuid, p_number text, p_parties text, p_signed_document_ref text, p_start_date date, p_end_date date)','AUTHED'),
  ('create_marketplace_listing_v1(p_listing_kind text, p_category text, p_title text, p_description text, p_location_country text, p_location_label text, p_price_text text, p_organization_id uuid, p_project_id uuid)','AUTHED'),
  ('create_proposal_v1(p_title text, p_amount_cents bigint, p_customer_request_id uuid, p_project_id uuid, p_number text, p_validity_until date, p_scope text, p_exclusions text)','AUTHED'),
  ('delete_defect_v1(p_defect_id uuid)','AUTHED'),
  ('delete_project_budget_v1(p_budget_id uuid)','AUTHED'),
  ('delete_project_stage_v1(p_stage_id uuid)','AUTHED'),
  ('is_admin()','AUTHED'),
  ('is_employer()','AUTHED'),
  ('issue_asset_v1(p_asset_id uuid, p_project_id uuid, p_worker_id uuid, p_condition_at_issue text, p_note text)','AUTHED'),
  ('manages_organization(org uuid)','AUTHED'),
  ('owns_agency(a uuid)','AUTHED'),
  ('owns_company(c uuid)','AUTHED'),
  ('owns_worker(w uuid)','AUTHED'),
  ('profile_role()','AUTHED'),
  ('report_defect_v1(p_project_id uuid, p_category text, p_description text, p_severity text, p_stage_id uuid, p_location text, p_due_date date)','AUTHED'),
  ('request_worker_absence_v1(p_worker_id uuid, p_absence_type text, p_start_date date, p_end_date date, p_half_day boolean, p_note text)','AUTHED'),
  ('return_asset_v1(p_assignment_id uuid, p_condition_at_return text, p_note text)','AUTHED'),
  ('review_worker_absence_v1(p_absence_id uuid, p_decision text)','AUTHED'),
  ('set_business_public_profile_v1(p_org_id uuid, p_enabled boolean, p_slug text, p_tagline text, p_contact_email text, p_contact_phone text)','AUTHED'),
  ('set_defect_status_v1(p_defect_id uuid, p_status text, p_assignee_profile_id uuid)','AUTHED'),
  ('set_project_budget_status_v1(p_budget_id uuid, p_status text)','AUTHED'),
  ('set_project_budget_v1(p_project_id uuid, p_category text, p_planned_amount_cents bigint, p_note text)','AUTHED'),
  ('transfer_asset_assignment_v1(p_assignment_id uuid, p_new_project_id uuid, p_new_worker_id uuid, p_note text)','AUTHED'),
  ('update_project_stage_v1(p_stage_id uuid, p_name text, p_status text, p_stage_order integer, p_planned_start date, p_planned_end date, p_actual_start date, p_actual_end date, p_blocked_reason text, p_completion_criteria text)','AUTHED'),
  ('enforce_company_verification_guard()','TRIGGER'),
  ('ensure_org_owner_engagement()','TRIGGER'),
  ('ensure_worker_personal_engagement()','TRIGGER'),
  ('ensure_worker_profile()','TRIGGER'),
  ('handle_new_user()','TRIGGER'),
  ('journal_entry_confirmations_guard()','TRIGGER'),
  ('learning_review_queue_guard_stale()','TRIGGER'),
  ('mirror_agency_to_org()','TRIGGER'),
  ('mirror_company_to_org()','TRIGGER'),
  ('owns_customer(c uuid)','DEAD')
) as t(sig, grp);

create temporary view _anon_reachable as
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig, p.oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
   and has_function_privilege('anon', p.oid, 'EXECUTE');

-- PROOF 1 — no non-allowlisted SECURITY DEFINER function is anon-reachable.
insert into _verdict
select 1, 'no non-allowlisted function is anon-reachable',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       case when count(*) = 0 then 'none'
            else count(*) || ' leaked: ' || string_agg(sig, ', ' order by sig) end
  from (select sig from _anon_reachable except select sig from _allowlist) s;

-- PROOF 2 — every allowlisted RPC is STILL anon-reachable (public product intact).
insert into _verdict
select 2, 'all 4 allowlisted RPCs remain anon-callable',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       case when count(*) = 0 then 'all 4 present'
            else 'BROKEN: ' || string_agg(sig, ', ' order by sig) end
  from (select sig from _allowlist except select sig from _anon_reachable) s;

-- PROOF 3 — every scoped and allowlisted signature exists in production, with
--           no overload ambiguity (exactly one function per name+identity args).
insert into _verdict
select 3, 'all 47 exact signatures exist, no overload confusion',
       case when count(*) filter (where n_match <> 1) = 0 then 'PASS' else 'FAIL' end,
       coalesce(string_agg(sig || '=' || n_match, ', ' order by sig)
                filter (where n_match <> 1), 'all 47 resolve to exactly 1 function')
  from (
    select t.sig,
           (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = t.sig) as n_match
    from (select sig from _scope union all select sig from _allowlist) t
  ) s;

-- PROOF 4 — no leftover default PUBLIC grant outside the allowlist. This is the
--           root cause of the original P0, not a side effect of it.
insert into _verdict
select 4, 'no PUBLIC (=X) EXECUTE grant outside the allowlist',
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

-- PROOF 5 — THE OUTAGE CHECK. All 33 authenticated-only functions must retain
--           EXECUTE for `authenticated`. RLS policy expressions are privilege-
--           checked against the querying role, so losing one of these would stop
--           policies evaluating for every logged-in user.
insert into _verdict
select 5, 'authenticated retains EXECUTE on all 33 authenticated-only functions',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       case when count(*) = 0 then '33/33 intact'
            else 'LOST: ' || string_agg(sig, ', ' order by sig) end
  from _scope s
 where s.grp = 'AUTHED'
   and not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = s.sig
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
   );

-- PROOF 6 — BEHAVIOURAL. Become `anon` and call three revoked functions.
--           Catalog agreement is not the same as the server saying no.
do $$
declare v_state text; v_fail integer := 0; v_detail text := '';
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);

  begin
    perform public.is_admin();
    v_fail := v_fail + 1; v_detail := v_detail || 'is_admin=REACHABLE ';
  exception when insufficient_privilege then v_detail := v_detail || 'is_admin=42501 ';
            when others then get stacked diagnostics v_state = returned_sqlstate;
              v_fail := v_fail + 1; v_detail := v_detail || 'is_admin=UNEXPECTED_' || v_state || ' ';
  end;

  begin
    perform public.owns_company('00000000-0000-0000-0000-000000000000'::uuid);
    v_fail := v_fail + 1; v_detail := v_detail || 'owns_company=REACHABLE ';
  exception when insufficient_privilege then v_detail := v_detail || 'owns_company=42501 ';
            when others then get stacked diagnostics v_state = returned_sqlstate;
              v_fail := v_fail + 1; v_detail := v_detail || 'owns_company=UNEXPECTED_' || v_state || ' ';
  end;

  begin
    perform public.create_contract_v1('PROBE', 0, null, null, null, null, null, null, null, null);
    v_fail := v_fail + 1; v_detail := v_detail || 'create_contract_v1=REACHABLE ';
  exception when insufficient_privilege then v_detail := v_detail || 'create_contract_v1=42501 ';
            when others then get stacked diagnostics v_state = returned_sqlstate;
              v_fail := v_fail + 1; v_detail := v_detail || 'create_contract_v1=UNEXPECTED_' || v_state || ' ';
  end;

  perform set_config('role', 'postgres', true);
  insert into _verdict values (6, 'anon is refused at the server on a live sample of 3',
    case when v_fail = 0 then 'PASS' else 'FAIL' end, trim(v_detail));
end $$;

-- PROOF 7 — BEHAVIOURAL. The intentionally-public read path still serves a
--           genuinely anonymous caller. Zero rows is a PASS; a privilege error
--           is a FAIL.
do $$
declare v_state text; v_n integer;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin
    select count(*) into v_n from public.get_public_business_profile_v1('__verification_probe_slug__');
    perform set_config('role', 'postgres', true);
    insert into _verdict values (7, 'public business-profile RPC still serves anon', 'PASS',
      'returned ' || v_n || ' row(s) with no privilege error');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    insert into _verdict values (7, 'public business-profile RPC still serves anon', 'FAIL',
      'sqlstate ' || v_state);
  end;
end $$;

-- PROOF 8 — the public intake table stays sealed. submit_company_need_public_v1
--           is only safe because a submitter cannot read the table back.
insert into _verdict
select 8, 'company_need_public_intakes unreadable by anon',
       case when not has_table_privilege('anon','public.company_need_public_intakes','SELECT')
                 and c.relrowsecurity then 'PASS' else 'FAIL' end,
       'anon_select=' || has_table_privilege('anon','public.company_need_public_intakes','SELECT')
         || ' rls=' || c.relrowsecurity
         || ' policies=' || (select count(*) from pg_policy where polrelid = c.oid)
  from pg_class c where c.oid = 'public.company_need_public_intakes'::regclass;

-- PROOF 9 — the 9 trigger-only functions and the 1 dead function hold NO grant
--           for anon or authenticated. Catches a convenience grant slipping in.
insert into _verdict
select 9, 'trigger-only (9) + dead (1) hold no anon/authenticated grant',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       case when count(*) = 0 then '10/10 ungranted'
            else 'still granted: ' || string_agg(sig, ', ' order by sig) end
  from _scope s
 where s.grp in ('TRIGGER','DEAD')
   and exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = s.sig
        and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
             or has_function_privilege('anon', p.oid, 'EXECUTE'))
   );

-- PROOF 10 — every trigger function is still attached to a trigger. Proves the
--            revoke did not detach anything and that "trigger-only" is a fact
--            about production, not an assumption inherited from the migrations.
insert into _verdict
select 10, 'all 9 trigger functions remain attached to a trigger',
       case when count(*) = 0 then 'PASS' else 'FAIL' end,
       case when count(*) = 0 then '9/9 attached'
            else 'DETACHED: ' || string_agg(sig, ', ' order by sig) end
  from _scope s
 where s.grp = 'TRIGGER'
   and not exists (
     select 1 from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = s.sig
        and not t.tgisinternal
   );

-- Harness integrity, then the report.
insert into _verdict
select 0, 'HARNESS',
       case when count(*) = 10 and count(distinct seq) = 10
                 and count(*) filter (where status is null) = 0
            then 'OK' else 'BROKEN' end,
       count(*) || ' verdicts, ' || count(*) filter (where status = 'FAIL') || ' FAIL'
  from _verdict where seq > 0;

select seq, proof, status, detail from _verdict order by seq;

rollback;
