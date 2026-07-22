-- @human-gate-approved
-- =====================================================================
-- Close accidental anonymous reachability on exactly 43 SECURITY DEFINER
-- functions in schema `public`.
--
-- OWNER GATE: approved 2026-07-22 under an explicit, strictly-bounded scope
-- (`OWNER GATE DECISION — APPROVED WITH STRICT SCOPE`). The
-- `@human-gate-approved` annotation above is placed under that specific
-- authorisation and under no other.
--
-- CONTEXT
-- -------
-- PR #845 (merged bfd4a5f8, ledger 20260722074749) fixed a P0: seven SECURITY
-- DEFINER RPCs were anon-reachable and compared ownership with a NULL-unsafe
-- `<> auth.uid()`, letting an unauthenticated caller rewrite and delete rows.
-- That fix covered those seven only.
--
-- Production still exposes 47 SECURITY DEFINER functions to `anon`. Exactly 4
-- of them carry a deliberate `anon=X` grant. The other 43 are reachable ONLY
-- through the leftover default PUBLIC grant (`=X/postgres`) — i.e. because
-- `GRANT ... TO authenticated` was written without `REVOKE ... FROM PUBLIC`.
-- That is the same root cause as the P0, and this migration removes it.
--
-- SCOPE — grants only. No CREATE OR REPLACE, no DROP, no ALTER TABLE, no DML,
-- no policy or trigger change, no wildcard/schema-wide grant, and not one
-- function body is touched.
--
-- THE `authenticated` RE-GRANT IS NOT UNIFORM, AND THAT IS DELIBERATE
-- -------------------------------------------------------------------
-- Verified per function against production `proacl` before writing this file:
--
--   * 25 of the 33 authenticated-only functions ALREADY hold a direct
--     `authenticated=X` grant. Revoking PUBLIC does not touch it. They are
--     deliberately NOT re-granted here — re-granting what already exists would
--     obscure which functions genuinely depend on this migration.
--
--   * 8 of them currently have `proacl IS NULL`, meaning `authenticated`
--     reaches them ONLY by inheriting PUBLIC. Those 8 — and only those 8 —
--     receive an explicit GRANT below. Omitting it would be an outage: RLS
--     policy expressions are privilege-checked against the querying role, so
--     every policy calling is_admin(), owns_worker(), manages_organization()
--     etc. would stop evaluating for logged-in users.
--
--   * The 9 trigger functions and the 1 dead function get NO grant. Verified:
--     all 9 are attached to exactly one trigger each (public.companies,
--     public.organizations, public.workers, public.profiles, auth.users,
--     public.journal_entry_confirmations, public.learning_review_queue,
--     public.agencies, public.companies) and have no direct call site. EXECUTE
--     is checked at CREATE TRIGGER time, not when a trigger fires, so revoking
--     cannot break a write. They are not granted to `authenticated` for
--     convenience.
--
-- WHY NO `service_role` GRANT
-- --------------------------
-- None of the 43 has a direct `service_role=X` grant today; service_role also
-- reaches them only via PUBLIC, and this migration therefore removes that too.
-- That is intentional and safe, verified two ways: `service_role` has
-- `rolbypassrls = true`, so RLS never evaluates and the predicate helpers can
-- never be needed by it; and the only non-test service-role code in the repo
-- (lib/sales/lead-intake.ts, app/api/leads/route.ts) performs plain table
-- operations on `leads` / `waitlist` / `customer_requests` with zero `.rpc()`
-- calls. No service_role EXECUTE dependency exists on any of the 43.
--
-- NOT IN SCOPE (each left to its own owner decision)
--   - the 4 intentionally-public RPCs — untouched, still anon-callable;
--   - dropping public.owns_customer(c uuid) — dead, revoked but NOT dropped;
--   - adding explicit `auth.uid() is null` guards to create_contract_v1,
--     create_proposal_v1, create_marketplace_listing_v1;
--   - the lookup-before-authorization existence oracle in 9 functions;
--   - rate limiting or dedupe on the public intake.
--
-- Rollback: supabase/rollbacks/20260722160000_secdef_anon_reach_revoke_v1.down.sql
-- Verification: supabase/tests/20260722160000_secdef_anon_reach_revoke_verification.sql
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Mutating RPCs (22) — authenticated product surface only.
--    All 22 already hold a direct `authenticated=X` grant; only the
--    inherited PUBLIC/anon path is removed.
-- ---------------------------------------------------------------------

revoke execute on function public.acknowledge_asset_assignment_v1(p_assignment_id uuid) from public;
revoke execute on function public.acknowledge_asset_assignment_v1(p_assignment_id uuid) from anon;

revoke execute on function public.add_defect_correction_v1(p_defect_id uuid, p_work_performed text, p_materials text, p_outcome text, p_completed_at date) from public;
revoke execute on function public.add_defect_correction_v1(p_defect_id uuid, p_work_performed text, p_materials text, p_outcome text, p_completed_at date) from anon;

revoke execute on function public.add_project_stage_v1(p_project_id uuid, p_name text, p_stage_order integer, p_planned_start date, p_planned_end date, p_completion_criteria text) from public;
revoke execute on function public.add_project_stage_v1(p_project_id uuid, p_name text, p_stage_order integer, p_planned_start date, p_planned_end date, p_completion_criteria text) from anon;

revoke execute on function public.cancel_worker_absence_v1(p_absence_id uuid) from public;
revoke execute on function public.cancel_worker_absence_v1(p_absence_id uuid) from anon;

revoke execute on function public.create_asset_v1(p_organization_id uuid, p_asset_type text, p_name text, p_serial_or_reg text, p_condition text, p_note text) from public;
revoke execute on function public.create_asset_v1(p_organization_id uuid, p_asset_type text, p_name text, p_serial_or_reg text, p_condition text, p_note text) from anon;

revoke execute on function public.create_contract_v1(p_title text, p_value_cents bigint, p_proposal_id uuid, p_project_id uuid, p_customer_request_id uuid, p_number text, p_parties text, p_signed_document_ref text, p_start_date date, p_end_date date) from public;
revoke execute on function public.create_contract_v1(p_title text, p_value_cents bigint, p_proposal_id uuid, p_project_id uuid, p_customer_request_id uuid, p_number text, p_parties text, p_signed_document_ref text, p_start_date date, p_end_date date) from anon;

revoke execute on function public.create_marketplace_listing_v1(p_listing_kind text, p_category text, p_title text, p_description text, p_location_country text, p_location_label text, p_price_text text, p_organization_id uuid, p_project_id uuid) from public;
revoke execute on function public.create_marketplace_listing_v1(p_listing_kind text, p_category text, p_title text, p_description text, p_location_country text, p_location_label text, p_price_text text, p_organization_id uuid, p_project_id uuid) from anon;

revoke execute on function public.create_proposal_v1(p_title text, p_amount_cents bigint, p_customer_request_id uuid, p_project_id uuid, p_number text, p_validity_until date, p_scope text, p_exclusions text) from public;
revoke execute on function public.create_proposal_v1(p_title text, p_amount_cents bigint, p_customer_request_id uuid, p_project_id uuid, p_number text, p_validity_until date, p_scope text, p_exclusions text) from anon;

revoke execute on function public.delete_defect_v1(p_defect_id uuid) from public;
revoke execute on function public.delete_defect_v1(p_defect_id uuid) from anon;

revoke execute on function public.delete_project_budget_v1(p_budget_id uuid) from public;
revoke execute on function public.delete_project_budget_v1(p_budget_id uuid) from anon;

revoke execute on function public.delete_project_stage_v1(p_stage_id uuid) from public;
revoke execute on function public.delete_project_stage_v1(p_stage_id uuid) from anon;

revoke execute on function public.issue_asset_v1(p_asset_id uuid, p_project_id uuid, p_worker_id uuid, p_condition_at_issue text, p_note text) from public;
revoke execute on function public.issue_asset_v1(p_asset_id uuid, p_project_id uuid, p_worker_id uuid, p_condition_at_issue text, p_note text) from anon;

revoke execute on function public.report_defect_v1(p_project_id uuid, p_category text, p_description text, p_severity text, p_stage_id uuid, p_location text, p_due_date date) from public;
revoke execute on function public.report_defect_v1(p_project_id uuid, p_category text, p_description text, p_severity text, p_stage_id uuid, p_location text, p_due_date date) from anon;

revoke execute on function public.request_worker_absence_v1(p_worker_id uuid, p_absence_type text, p_start_date date, p_end_date date, p_half_day boolean, p_note text) from public;
revoke execute on function public.request_worker_absence_v1(p_worker_id uuid, p_absence_type text, p_start_date date, p_end_date date, p_half_day boolean, p_note text) from anon;

revoke execute on function public.return_asset_v1(p_assignment_id uuid, p_condition_at_return text, p_note text) from public;
revoke execute on function public.return_asset_v1(p_assignment_id uuid, p_condition_at_return text, p_note text) from anon;

revoke execute on function public.review_worker_absence_v1(p_absence_id uuid, p_decision text) from public;
revoke execute on function public.review_worker_absence_v1(p_absence_id uuid, p_decision text) from anon;

revoke execute on function public.set_business_public_profile_v1(p_org_id uuid, p_enabled boolean, p_slug text, p_tagline text, p_contact_email text, p_contact_phone text) from public;
revoke execute on function public.set_business_public_profile_v1(p_org_id uuid, p_enabled boolean, p_slug text, p_tagline text, p_contact_email text, p_contact_phone text) from anon;

revoke execute on function public.set_defect_status_v1(p_defect_id uuid, p_status text, p_assignee_profile_id uuid) from public;
revoke execute on function public.set_defect_status_v1(p_defect_id uuid, p_status text, p_assignee_profile_id uuid) from anon;

revoke execute on function public.set_project_budget_status_v1(p_budget_id uuid, p_status text) from public;
revoke execute on function public.set_project_budget_status_v1(p_budget_id uuid, p_status text) from anon;

revoke execute on function public.set_project_budget_v1(p_project_id uuid, p_category text, p_planned_amount_cents bigint, p_note text) from public;
revoke execute on function public.set_project_budget_v1(p_project_id uuid, p_category text, p_planned_amount_cents bigint, p_note text) from anon;

revoke execute on function public.transfer_asset_assignment_v1(p_assignment_id uuid, p_new_project_id uuid, p_new_worker_id uuid, p_note text) from public;
revoke execute on function public.transfer_asset_assignment_v1(p_assignment_id uuid, p_new_project_id uuid, p_new_worker_id uuid, p_note text) from anon;

revoke execute on function public.update_project_stage_v1(p_stage_id uuid, p_name text, p_status text, p_stage_order integer, p_planned_start date, p_planned_end date, p_actual_start date, p_actual_end date, p_blocked_reason text, p_completion_criteria text) from public;
revoke execute on function public.update_project_stage_v1(p_stage_id uuid, p_name text, p_status text, p_stage_order integer, p_planned_start date, p_planned_end date, p_actual_start date, p_actual_end date, p_blocked_reason text, p_completion_criteria text) from anon;

-- ---------------------------------------------------------------------
-- 2a. Predicate helpers that ALREADY hold a direct `authenticated=X` grant (3).
--     Revoke only; no grant needed.
-- ---------------------------------------------------------------------

revoke execute on function public.asset_open_assignment_for_caller(p_asset_id uuid) from public;
revoke execute on function public.asset_open_assignment_for_caller(p_asset_id uuid) from anon;

revoke execute on function public.caller_manages_asset(p_asset_id uuid) from public;
revoke execute on function public.caller_manages_asset(p_asset_id uuid) from anon;

revoke execute on function public.caller_manages_defect(p_defect_id uuid) from public;
revoke execute on function public.caller_manages_defect(p_defect_id uuid) from anon;

-- ---------------------------------------------------------------------
-- 2b. Predicate helpers whose `proacl IS NULL` — `authenticated` reaches them
--     ONLY by inheriting PUBLIC (8). These are the ONLY functions in this
--     migration that require an explicit GRANT. Without it, revoking PUBLIC
--     would break every RLS policy that calls them for logged-in users.
-- ---------------------------------------------------------------------

revoke execute on function public.can_access_match(m uuid) from public;
revoke execute on function public.can_access_match(m uuid) from anon;
grant  execute on function public.can_access_match(m uuid) to authenticated;

revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant  execute on function public.is_admin() to authenticated;

revoke execute on function public.is_employer() from public;
revoke execute on function public.is_employer() from anon;
grant  execute on function public.is_employer() to authenticated;

revoke execute on function public.manages_organization(org uuid) from public;
revoke execute on function public.manages_organization(org uuid) from anon;
grant  execute on function public.manages_organization(org uuid) to authenticated;

revoke execute on function public.owns_agency(a uuid) from public;
revoke execute on function public.owns_agency(a uuid) from anon;
grant  execute on function public.owns_agency(a uuid) to authenticated;

revoke execute on function public.owns_company(c uuid) from public;
revoke execute on function public.owns_company(c uuid) from anon;
grant  execute on function public.owns_company(c uuid) to authenticated;

revoke execute on function public.owns_worker(w uuid) from public;
revoke execute on function public.owns_worker(w uuid) from anon;
grant  execute on function public.owns_worker(w uuid) to authenticated;

revoke execute on function public.profile_role() from public;
revoke execute on function public.profile_role() from anon;
grant  execute on function public.profile_role() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Dead function (1) — revoke only. Deliberately NOT dropped, NOT granted.
--    public.owns_customer(c uuid) has zero call sites: no RLS policy, no
--    trigger, no RPC body, no application code. Removing it is a separate
--    owner decision.
-- ---------------------------------------------------------------------

revoke execute on function public.owns_customer(c uuid) from public;
revoke execute on function public.owns_customer(c uuid) from anon;

-- ---------------------------------------------------------------------
-- 4. Trigger functions (9) — revoke only, no grant to any client role.
--    Each is attached to exactly one trigger and has no direct call site.
-- ---------------------------------------------------------------------

revoke execute on function public.enforce_company_verification_guard() from public;
revoke execute on function public.enforce_company_verification_guard() from anon;

revoke execute on function public.ensure_org_owner_engagement() from public;
revoke execute on function public.ensure_org_owner_engagement() from anon;

revoke execute on function public.ensure_worker_personal_engagement() from public;
revoke execute on function public.ensure_worker_personal_engagement() from anon;

revoke execute on function public.ensure_worker_profile() from public;
revoke execute on function public.ensure_worker_profile() from anon;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;

revoke execute on function public.journal_entry_confirmations_guard() from public;
revoke execute on function public.journal_entry_confirmations_guard() from anon;

revoke execute on function public.learning_review_queue_guard_stale() from public;
revoke execute on function public.learning_review_queue_guard_stale() from anon;

revoke execute on function public.mirror_agency_to_org() from public;
revoke execute on function public.mirror_agency_to_org() from anon;

revoke execute on function public.mirror_company_to_org() from public;
revoke execute on function public.mirror_company_to_org() from anon;

-- ---------------------------------------------------------------------
-- 5. Fail-closed assertion. The migration refuses to commit unless the
--    resulting state matches the approved matrix EXACTLY, by signature
--    identity. Never a count: a swap preserving the number would still abort.
-- ---------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  -- 5a. anon must reach exactly the four allowlisted signatures, no more.
  select string_agg(sig, ', ' order by sig) into v_bad
  from (
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) s
  where s.sig not in (
    'get_public_business_profile_v1(p_slug text)',
    'get_public_business_listings_v1(p_org_id uuid)',
    'get_public_business_services_v1(p_org_id uuid)',
    'submit_company_need_public_v1(p_locale text, p_company_name text, p_contact_name text, p_contact_email text, p_contact_phone text, p_country text, p_city_region text, p_sector text, p_headcount integer, p_start_window text, p_expected_duration text, p_urgency text, p_accommodation text, p_transport_needed boolean, p_languages text, p_engagement_type text, p_description text, p_source_path text)'
  );
  if v_bad is not null then
    raise exception 'anon still reaches non-allowlisted SECURITY DEFINER function(s): %', v_bad;
  end if;

  -- 5b. ...and must still reach all four (no public surface broken).
  select string_agg(want, ', ') into v_bad
  from (values
    ('get_public_business_profile_v1(p_slug text)'),
    ('get_public_business_listings_v1(p_org_id uuid)'),
    ('get_public_business_services_v1(p_org_id uuid)'),
    ('submit_company_need_public_v1(p_locale text, p_company_name text, p_contact_name text, p_contact_email text, p_contact_phone text, p_country text, p_city_region text, p_sector text, p_headcount integer, p_start_window text, p_expected_duration text, p_urgency text, p_accommodation text, p_transport_needed boolean, p_languages text, p_engagement_type text, p_description text, p_source_path text)')
  ) as t(want)
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = t.want
  );
  if v_bad is not null then
    raise exception 'this migration broke an intentionally-public RPC: %', v_bad;
  end if;

  -- 5c. All 33 authenticated-only functions must retain EXECUTE for
  --     `authenticated`. This is the outage check.
  select string_agg(sig, ', ' order by sig) into v_bad
  from (values
    ('acknowledge_asset_assignment_v1(p_assignment_id uuid)'),
    ('add_defect_correction_v1(p_defect_id uuid, p_work_performed text, p_materials text, p_outcome text, p_completed_at date)'),
    ('add_project_stage_v1(p_project_id uuid, p_name text, p_stage_order integer, p_planned_start date, p_planned_end date, p_completion_criteria text)'),
    ('asset_open_assignment_for_caller(p_asset_id uuid)'),
    ('caller_manages_asset(p_asset_id uuid)'),
    ('caller_manages_defect(p_defect_id uuid)'),
    ('can_access_match(m uuid)'),
    ('cancel_worker_absence_v1(p_absence_id uuid)'),
    ('create_asset_v1(p_organization_id uuid, p_asset_type text, p_name text, p_serial_or_reg text, p_condition text, p_note text)'),
    ('create_contract_v1(p_title text, p_value_cents bigint, p_proposal_id uuid, p_project_id uuid, p_customer_request_id uuid, p_number text, p_parties text, p_signed_document_ref text, p_start_date date, p_end_date date)'),
    ('create_marketplace_listing_v1(p_listing_kind text, p_category text, p_title text, p_description text, p_location_country text, p_location_label text, p_price_text text, p_organization_id uuid, p_project_id uuid)'),
    ('create_proposal_v1(p_title text, p_amount_cents bigint, p_customer_request_id uuid, p_project_id uuid, p_number text, p_validity_until date, p_scope text, p_exclusions text)'),
    ('delete_defect_v1(p_defect_id uuid)'),
    ('delete_project_budget_v1(p_budget_id uuid)'),
    ('delete_project_stage_v1(p_stage_id uuid)'),
    ('is_admin()'),
    ('is_employer()'),
    ('issue_asset_v1(p_asset_id uuid, p_project_id uuid, p_worker_id uuid, p_condition_at_issue text, p_note text)'),
    ('manages_organization(org uuid)'),
    ('owns_agency(a uuid)'),
    ('owns_company(c uuid)'),
    ('owns_worker(w uuid)'),
    ('profile_role()'),
    ('report_defect_v1(p_project_id uuid, p_category text, p_description text, p_severity text, p_stage_id uuid, p_location text, p_due_date date)'),
    ('request_worker_absence_v1(p_worker_id uuid, p_absence_type text, p_start_date date, p_end_date date, p_half_day boolean, p_note text)'),
    ('return_asset_v1(p_assignment_id uuid, p_condition_at_return text, p_note text)'),
    ('review_worker_absence_v1(p_absence_id uuid, p_decision text)'),
    ('set_business_public_profile_v1(p_org_id uuid, p_enabled boolean, p_slug text, p_tagline text, p_contact_email text, p_contact_phone text)'),
    ('set_defect_status_v1(p_defect_id uuid, p_status text, p_assignee_profile_id uuid)'),
    ('set_project_budget_status_v1(p_budget_id uuid, p_status text)'),
    ('set_project_budget_v1(p_project_id uuid, p_category text, p_planned_amount_cents bigint, p_note text)'),
    ('transfer_asset_assignment_v1(p_assignment_id uuid, p_new_project_id uuid, p_new_worker_id uuid, p_note text)'),
    ('update_project_stage_v1(p_stage_id uuid, p_name text, p_status text, p_stage_order integer, p_planned_start date, p_planned_end date, p_actual_start date, p_actual_end date, p_blocked_reason text, p_completion_criteria text)')
  ) as t(sig)
  where not has_function_privilege('authenticated', ('public.' || t.sig)::regprocedure, 'EXECUTE');
  if v_bad is not null then
    raise exception 'authenticated LOST EXECUTE on authenticated-only function(s): %', v_bad;
  end if;

  -- 5d. The 9 trigger functions and the 1 dead function must hold NO grant for
  --     anon or authenticated. Catches a convenience grant slipping in.
  select string_agg(sig, ', ' order by sig) into v_bad
  from (values
    ('enforce_company_verification_guard()'), ('ensure_org_owner_engagement()'),
    ('ensure_worker_personal_engagement()'), ('ensure_worker_profile()'),
    ('handle_new_user()'), ('journal_entry_confirmations_guard()'),
    ('learning_review_queue_guard_stale()'), ('mirror_agency_to_org()'),
    ('mirror_company_to_org()'), ('owns_customer(c uuid)')
  ) as t(sig)
  where has_function_privilege('authenticated', ('public.' || t.sig)::regprocedure, 'EXECUTE')
     or has_function_privilege('anon', ('public.' || t.sig)::regprocedure, 'EXECUTE');
  if v_bad is not null then
    raise exception 'trigger-only/dead function(s) unexpectedly still granted: %', v_bad;
  end if;
end $$;

commit;
