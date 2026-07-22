-- =====================================================================
-- ROLLBACK for 20260722160000_secdef_anon_reach_revoke_v1.sql
--
-- READ THIS BEFORE RUNNING IT.
--
-- This rollback restores the DEFAULT PUBLIC EXECUTE GRANT on 43 SECURITY
-- DEFINER functions. That grant is the exact mechanism that made the 2026-07-22
-- P0 exploitable: it is what allowed an anonymous caller to reach RPCs that
-- believed they were reachable only by logged-in users.
--
-- Running this re-opens anonymous reachability on all 43. It is provided
-- because a migration without a tested rollback is not reviewable, NOT because
-- reverting is expected to be a good idea. If the forward migration causes an
-- incident, prefer diagnosing the single failing function and re-granting only
-- that one over restoring PUBLIC across the board.
--
-- The forward migration is grant-only: it creates nothing, drops nothing, and
-- changes no function body or data. There is therefore no data to restore.
-- =====================================================================

begin;

-- 1. Mutating RPCs (22)
grant execute on function public.acknowledge_asset_assignment_v1(p_assignment_id uuid) to public;
grant execute on function public.add_defect_correction_v1(p_defect_id uuid, p_work_performed text, p_materials text, p_outcome text, p_completed_at date) to public;
grant execute on function public.add_project_stage_v1(p_project_id uuid, p_name text, p_stage_order integer, p_planned_start date, p_planned_end date, p_completion_criteria text) to public;
grant execute on function public.cancel_worker_absence_v1(p_absence_id uuid) to public;
grant execute on function public.create_asset_v1(p_organization_id uuid, p_asset_type text, p_name text, p_serial_or_reg text, p_condition text, p_note text) to public;
grant execute on function public.create_contract_v1(p_title text, p_value_cents bigint, p_proposal_id uuid, p_project_id uuid, p_customer_request_id uuid, p_number text, p_parties text, p_signed_document_ref text, p_start_date date, p_end_date date) to public;
grant execute on function public.create_marketplace_listing_v1(p_listing_kind text, p_category text, p_title text, p_description text, p_location_country text, p_location_label text, p_price_text text, p_organization_id uuid, p_project_id uuid) to public;
grant execute on function public.create_proposal_v1(p_title text, p_amount_cents bigint, p_customer_request_id uuid, p_project_id uuid, p_number text, p_validity_until date, p_scope text, p_exclusions text) to public;
grant execute on function public.delete_defect_v1(p_defect_id uuid) to public;
grant execute on function public.delete_project_budget_v1(p_budget_id uuid) to public;
grant execute on function public.delete_project_stage_v1(p_stage_id uuid) to public;
grant execute on function public.issue_asset_v1(p_asset_id uuid, p_project_id uuid, p_worker_id uuid, p_condition_at_issue text, p_note text) to public;
grant execute on function public.report_defect_v1(p_project_id uuid, p_category text, p_description text, p_severity text, p_stage_id uuid, p_location text, p_due_date date) to public;
grant execute on function public.request_worker_absence_v1(p_worker_id uuid, p_absence_type text, p_start_date date, p_end_date date, p_half_day boolean, p_note text) to public;
grant execute on function public.return_asset_v1(p_assignment_id uuid, p_condition_at_return text, p_note text) to public;
grant execute on function public.review_worker_absence_v1(p_absence_id uuid, p_decision text) to public;
grant execute on function public.set_business_public_profile_v1(p_org_id uuid, p_enabled boolean, p_slug text, p_tagline text, p_contact_email text, p_contact_phone text) to public;
grant execute on function public.set_defect_status_v1(p_defect_id uuid, p_status text, p_assignee_profile_id uuid) to public;
grant execute on function public.set_project_budget_status_v1(p_budget_id uuid, p_status text) to public;
grant execute on function public.set_project_budget_v1(p_project_id uuid, p_category text, p_planned_amount_cents bigint, p_note text) to public;
grant execute on function public.transfer_asset_assignment_v1(p_assignment_id uuid, p_new_project_id uuid, p_new_worker_id uuid, p_note text) to public;
grant execute on function public.update_project_stage_v1(p_stage_id uuid, p_name text, p_status text, p_stage_order integer, p_planned_start date, p_planned_end date, p_actual_start date, p_actual_end date, p_blocked_reason text, p_completion_criteria text) to public;

-- 2. Predicate helpers (12)
grant execute on function public.asset_open_assignment_for_caller(p_asset_id uuid) to public;
grant execute on function public.caller_manages_asset(p_asset_id uuid) to public;
grant execute on function public.caller_manages_defect(p_defect_id uuid) to public;
grant execute on function public.can_access_match(m uuid) to public;
grant execute on function public.is_admin() to public;
grant execute on function public.is_employer() to public;
grant execute on function public.manages_organization(org uuid) to public;
grant execute on function public.owns_agency(a uuid) to public;
grant execute on function public.owns_company(c uuid) to public;
grant execute on function public.owns_customer(c uuid) to public;
grant execute on function public.owns_worker(w uuid) to public;
grant execute on function public.profile_role() to public;

-- 3. Trigger functions (9)
grant execute on function public.enforce_company_verification_guard() to public;
grant execute on function public.ensure_org_owner_engagement() to public;
grant execute on function public.ensure_worker_personal_engagement() to public;
grant execute on function public.ensure_worker_profile() to public;
grant execute on function public.handle_new_user() to public;
grant execute on function public.journal_entry_confirmations_guard() to public;
grant execute on function public.learning_review_queue_guard_stale() to public;
grant execute on function public.mirror_agency_to_org() to public;
grant execute on function public.mirror_company_to_org() to public;

commit;
