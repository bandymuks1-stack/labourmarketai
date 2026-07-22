-- =====================================================================
-- Close anonymous reachability of the 43 SECURITY DEFINER functions that
-- were never meant to be anon-callable.
--
-- STATUS: DRAFT — NOT APPLIED TO PRODUCTION. Owner gate required.
--
-- CONTEXT
-- -------
-- 2026-07-22, PR #845 (merged bfd4a5f8, ledger 20260722074749) fixed a P0:
-- seven SECURITY DEFINER RPCs were anon-reachable AND compared ownership with a
-- NULL-unsafe `<> auth.uid()`, so an unauthenticated caller could rewrite and
-- delete other people's rows. That fix covered exactly those seven.
--
-- Production still exposes 47 SECURITY DEFINER functions in `public` to `anon`.
-- This migration closes 43 of them. The other 4 are the reviewed, deliberately
-- public allowlist and are deliberately NOT touched.
--
-- WHY 43 AND NOT "ALL BUT FOUR BY COUNT"
-- --------------------------------------
-- The split is not arbitrary and is not a count. In production only four
-- functions carry an explicit `anon=X` grant in `proacl`. All 43 below reach
-- `anon` solely through the leftover default PUBLIC grant (`=X/postgres`) —
-- i.e. because `GRANT ... TO authenticated` was issued without a matching
-- `REVOKE ... FROM PUBLIC`. They are reachable by accident, not by decision.
--
-- WHY THIS IS SAFE (each claim verified against production before writing)
-- -----------------------------------------------------------------------
--  1. 22 mutating RPCs — every call site is a "use server" module under
--     app/[locale]/dashboard/** that calls supabase.auth.getUser() first.
--     Zero anonymous callers. They keep their `authenticated` grant.
--  2. 12 predicate helpers — used inside RLS policy expressions. Policy
--     expressions ARE privilege-checked against the querying role, so the
--     `authenticated` grant below is REQUIRED, not cosmetic. Verified: not one
--     table whose policies reference these helpers is anon-SELECTable, so no
--     anonymous read path depends on them.
--  3. 9 trigger functions — `returns trigger`; EXECUTE is checked at CREATE
--     TRIGGER time, not when the trigger fires, so revoking cannot break a
--     write. They are also not usefully callable over PostgREST.
--  4. Calls made from INSIDE another SECURITY DEFINER body keep working, because
--     that body executes as its owner (postgres), not as the caller. Production
--     already proves this: public.caller_manages_worker(uuid) has no anon grant
--     today and is called successfully from review_worker_absence_v1.
--
-- `service_role` and `authenticated` are re-granted explicitly on every function
-- so that this migration removes EXACTLY the anonymous path and changes nothing
-- else. Both currently hold EXECUTE via the same PUBLIC grant being revoked;
-- without the re-grant this migration would be an outage.
--
-- NOT IN SCOPE
--  - The 4 intentionally-public RPCs (unchanged, still anon-callable).
--  - Dropping public.owns_customer(c uuid). It has zero call sites anywhere —
--    no policy, no trigger, no RPC body, no app code — but a DROP is an owner
--    decision and is deliberately not bundled into a permissions change.
--  - The pre-authorization row-existence probes documented in the audit
--    (functions that look a row up before checking identity, so a caller can
--    distinguish "not found" from "not authorized"). Fixing those means editing
--    function bodies; this migration only changes grants.
--
-- Rollback: supabase/rollbacks/20260722160000_secdef_anon_reach_revoke_v1.down.sql
-- Verification: supabase/tests/20260722160000_secdef_anon_reach_revoke_verification.sql
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Mutating RPCs (22) — authenticated product surface only.
-- ---------------------------------------------------------------------

revoke execute on function public.acknowledge_asset_assignment_v1(p_assignment_id uuid) from public, anon;
grant  execute on function public.acknowledge_asset_assignment_v1(p_assignment_id uuid) to authenticated, service_role;

revoke execute on function public.add_defect_correction_v1(p_defect_id uuid, p_work_performed text, p_materials text, p_outcome text, p_completed_at date) from public, anon;
grant  execute on function public.add_defect_correction_v1(p_defect_id uuid, p_work_performed text, p_materials text, p_outcome text, p_completed_at date) to authenticated, service_role;

revoke execute on function public.add_project_stage_v1(p_project_id uuid, p_name text, p_stage_order integer, p_planned_start date, p_planned_end date, p_completion_criteria text) from public, anon;
grant  execute on function public.add_project_stage_v1(p_project_id uuid, p_name text, p_stage_order integer, p_planned_start date, p_planned_end date, p_completion_criteria text) to authenticated, service_role;

revoke execute on function public.cancel_worker_absence_v1(p_absence_id uuid) from public, anon;
grant  execute on function public.cancel_worker_absence_v1(p_absence_id uuid) to authenticated, service_role;

revoke execute on function public.create_asset_v1(p_organization_id uuid, p_asset_type text, p_name text, p_serial_or_reg text, p_condition text, p_note text) from public, anon;
grant  execute on function public.create_asset_v1(p_organization_id uuid, p_asset_type text, p_name text, p_serial_or_reg text, p_condition text, p_note text) to authenticated, service_role;

revoke execute on function public.create_contract_v1(p_title text, p_value_cents bigint, p_proposal_id uuid, p_project_id uuid, p_customer_request_id uuid, p_number text, p_parties text, p_signed_document_ref text, p_start_date date, p_end_date date) from public, anon;
grant  execute on function public.create_contract_v1(p_title text, p_value_cents bigint, p_proposal_id uuid, p_project_id uuid, p_customer_request_id uuid, p_number text, p_parties text, p_signed_document_ref text, p_start_date date, p_end_date date) to authenticated, service_role;

revoke execute on function public.create_marketplace_listing_v1(p_listing_kind text, p_category text, p_title text, p_description text, p_location_country text, p_location_label text, p_price_text text, p_organization_id uuid, p_project_id uuid) from public, anon;
grant  execute on function public.create_marketplace_listing_v1(p_listing_kind text, p_category text, p_title text, p_description text, p_location_country text, p_location_label text, p_price_text text, p_organization_id uuid, p_project_id uuid) to authenticated, service_role;

revoke execute on function public.create_proposal_v1(p_title text, p_amount_cents bigint, p_customer_request_id uuid, p_project_id uuid, p_number text, p_validity_until date, p_scope text, p_exclusions text) from public, anon;
grant  execute on function public.create_proposal_v1(p_title text, p_amount_cents bigint, p_customer_request_id uuid, p_project_id uuid, p_number text, p_validity_until date, p_scope text, p_exclusions text) to authenticated, service_role;

revoke execute on function public.delete_defect_v1(p_defect_id uuid) from public, anon;
grant  execute on function public.delete_defect_v1(p_defect_id uuid) to authenticated, service_role;

revoke execute on function public.delete_project_budget_v1(p_budget_id uuid) from public, anon;
grant  execute on function public.delete_project_budget_v1(p_budget_id uuid) to authenticated, service_role;

revoke execute on function public.delete_project_stage_v1(p_stage_id uuid) from public, anon;
grant  execute on function public.delete_project_stage_v1(p_stage_id uuid) to authenticated, service_role;

revoke execute on function public.issue_asset_v1(p_asset_id uuid, p_project_id uuid, p_worker_id uuid, p_condition_at_issue text, p_note text) from public, anon;
grant  execute on function public.issue_asset_v1(p_asset_id uuid, p_project_id uuid, p_worker_id uuid, p_condition_at_issue text, p_note text) to authenticated, service_role;

revoke execute on function public.report_defect_v1(p_project_id uuid, p_category text, p_description text, p_severity text, p_stage_id uuid, p_location text, p_due_date date) from public, anon;
grant  execute on function public.report_defect_v1(p_project_id uuid, p_category text, p_description text, p_severity text, p_stage_id uuid, p_location text, p_due_date date) to authenticated, service_role;

revoke execute on function public.request_worker_absence_v1(p_worker_id uuid, p_absence_type text, p_start_date date, p_end_date date, p_half_day boolean, p_note text) from public, anon;
grant  execute on function public.request_worker_absence_v1(p_worker_id uuid, p_absence_type text, p_start_date date, p_end_date date, p_half_day boolean, p_note text) to authenticated, service_role;

revoke execute on function public.return_asset_v1(p_assignment_id uuid, p_condition_at_return text, p_note text) from public, anon;
grant  execute on function public.return_asset_v1(p_assignment_id uuid, p_condition_at_return text, p_note text) to authenticated, service_role;

revoke execute on function public.review_worker_absence_v1(p_absence_id uuid, p_decision text) from public, anon;
grant  execute on function public.review_worker_absence_v1(p_absence_id uuid, p_decision text) to authenticated, service_role;

revoke execute on function public.set_business_public_profile_v1(p_org_id uuid, p_enabled boolean, p_slug text, p_tagline text, p_contact_email text, p_contact_phone text) from public, anon;
grant  execute on function public.set_business_public_profile_v1(p_org_id uuid, p_enabled boolean, p_slug text, p_tagline text, p_contact_email text, p_contact_phone text) to authenticated, service_role;

revoke execute on function public.set_defect_status_v1(p_defect_id uuid, p_status text, p_assignee_profile_id uuid) from public, anon;
grant  execute on function public.set_defect_status_v1(p_defect_id uuid, p_status text, p_assignee_profile_id uuid) to authenticated, service_role;

revoke execute on function public.set_project_budget_status_v1(p_budget_id uuid, p_status text) from public, anon;
grant  execute on function public.set_project_budget_status_v1(p_budget_id uuid, p_status text) to authenticated, service_role;

revoke execute on function public.set_project_budget_v1(p_project_id uuid, p_category text, p_planned_amount_cents bigint, p_note text) from public, anon;
grant  execute on function public.set_project_budget_v1(p_project_id uuid, p_category text, p_planned_amount_cents bigint, p_note text) to authenticated, service_role;

revoke execute on function public.transfer_asset_assignment_v1(p_assignment_id uuid, p_new_project_id uuid, p_new_worker_id uuid, p_note text) from public, anon;
grant  execute on function public.transfer_asset_assignment_v1(p_assignment_id uuid, p_new_project_id uuid, p_new_worker_id uuid, p_note text) to authenticated, service_role;

revoke execute on function public.update_project_stage_v1(p_stage_id uuid, p_name text, p_status text, p_stage_order integer, p_planned_start date, p_planned_end date, p_actual_start date, p_actual_end date, p_blocked_reason text, p_completion_criteria text) from public, anon;
grant  execute on function public.update_project_stage_v1(p_stage_id uuid, p_name text, p_status text, p_stage_order integer, p_planned_start date, p_planned_end date, p_actual_start date, p_actual_end date, p_blocked_reason text, p_completion_criteria text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Predicate helpers (12) — evaluated inside RLS policies.
--    The `authenticated` grant here is LOAD-BEARING: an RLS policy expression is
--    privilege-checked against the querying role. Dropping it would make every
--    policy that calls these fail for logged-in users.
-- ---------------------------------------------------------------------

revoke execute on function public.asset_open_assignment_for_caller(p_asset_id uuid) from public, anon;
grant  execute on function public.asset_open_assignment_for_caller(p_asset_id uuid) to authenticated, service_role;

revoke execute on function public.caller_manages_asset(p_asset_id uuid) from public, anon;
grant  execute on function public.caller_manages_asset(p_asset_id uuid) to authenticated, service_role;

revoke execute on function public.caller_manages_defect(p_defect_id uuid) from public, anon;
grant  execute on function public.caller_manages_defect(p_defect_id uuid) to authenticated, service_role;

revoke execute on function public.can_access_match(m uuid) from public, anon;
grant  execute on function public.can_access_match(m uuid) to authenticated, service_role;

revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated, service_role;

revoke execute on function public.is_employer() from public, anon;
grant  execute on function public.is_employer() to authenticated, service_role;

revoke execute on function public.manages_organization(org uuid) from public, anon;
grant  execute on function public.manages_organization(org uuid) to authenticated, service_role;

revoke execute on function public.owns_agency(a uuid) from public, anon;
grant  execute on function public.owns_agency(a uuid) to authenticated, service_role;

revoke execute on function public.owns_company(c uuid) from public, anon;
grant  execute on function public.owns_company(c uuid) to authenticated, service_role;

-- owns_customer has ZERO call sites in production (no policy, trigger, RPC body
-- or app code). It is revoked from anon like the rest, but deliberately NOT
-- dropped — removing a function is a separate owner decision.
revoke execute on function public.owns_customer(c uuid) from public, anon;
grant  execute on function public.owns_customer(c uuid) to authenticated, service_role;

revoke execute on function public.owns_worker(w uuid) from public, anon;
grant  execute on function public.owns_worker(w uuid) to authenticated, service_role;

revoke execute on function public.profile_role() from public, anon;
grant  execute on function public.profile_role() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Trigger functions (9) — `returns trigger`, never called directly.
--    EXECUTE is checked at CREATE TRIGGER time, not at fire time, so these
--    revokes cannot break any write path.
-- ---------------------------------------------------------------------

revoke execute on function public.enforce_company_verification_guard() from public, anon;
grant  execute on function public.enforce_company_verification_guard() to authenticated, service_role;

revoke execute on function public.ensure_org_owner_engagement() from public, anon;
grant  execute on function public.ensure_org_owner_engagement() to authenticated, service_role;

revoke execute on function public.ensure_worker_personal_engagement() from public, anon;
grant  execute on function public.ensure_worker_personal_engagement() to authenticated, service_role;

revoke execute on function public.ensure_worker_profile() from public, anon;
grant  execute on function public.ensure_worker_profile() to authenticated, service_role;

revoke execute on function public.handle_new_user() from public, anon;
grant  execute on function public.handle_new_user() to authenticated, service_role;

revoke execute on function public.journal_entry_confirmations_guard() from public, anon;
grant  execute on function public.journal_entry_confirmations_guard() to authenticated, service_role;

revoke execute on function public.learning_review_queue_guard_stale() from public, anon;
grant  execute on function public.learning_review_queue_guard_stale() to authenticated, service_role;

revoke execute on function public.mirror_agency_to_org() from public, anon;
grant  execute on function public.mirror_agency_to_org() to authenticated, service_role;

revoke execute on function public.mirror_company_to_org() from public, anon;
grant  execute on function public.mirror_company_to_org() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Fail-closed assertion — the migration refuses to commit unless the
--    resulting anon-reachable set is EXACTLY the four allowlisted signatures.
--    This is an identity check, never a count check: a swap that preserved the
--    number would still abort here.
-- ---------------------------------------------------------------------
do $$
declare
  v_unexpected text;
  v_missing    text;
begin
  select string_agg(sig, ', ' order by sig) into v_unexpected
  from (
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) s
  where s.sig not in (
    'get_public_business_profile_v1(p_slug text)',
    'get_public_business_listings_v1(p_org_id uuid)',
    'get_public_business_services_v1(p_org_id uuid)',
    'submit_company_need_public_v1(p_locale text, p_company_name text, p_contact_name text, p_contact_email text, p_contact_phone text, p_country text, p_city_region text, p_sector text, p_headcount integer, p_start_window text, p_expected_duration text, p_urgency text, p_accommodation text, p_transport_needed boolean, p_languages text, p_engagement_type text, p_description text, p_source_path text)'
  );

  if v_unexpected is not null then
    raise exception 'anon still reaches non-allowlisted SECURITY DEFINER function(s): %', v_unexpected;
  end if;

  select string_agg(want, ', ') into v_missing
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

  if v_missing is not null then
    raise exception 'this migration broke an intentionally-public RPC: %', v_missing;
  end if;
end $$;

commit;
