-- DOWN / rollback for 20260612210000_phase_b3_fk_indexes.sql
--
-- Drops ONLY the 24 indexes created by the forward migration. Reversible,
-- no data impact. Apply via Supabase MCP apply_migration, never `db push`.

begin;

drop index if exists public.idx_agencies_profile_id;
drop index if exists public.idx_agency_workers_worker_id;
drop index if exists public.idx_audit_logs_actor_id;
drop index if exists public.idx_candidate_drafts_linked_profile_id;
drop index if exists public.idx_company_workers_worker_id;
drop index if exists public.idx_consents_profile_id;
drop index if exists public.idx_language_feedback_user_id;
drop index if exists public.idx_leads_assigned_to;
drop index if exists public.idx_market_rate_averages_entered_by;
drop index if exists public.idx_pilot_events_profile_id;
drop index if exists public.idx_productivity_units_created_by_profile_id;
drop index if exists public.idx_subscriptions_profile_id;
drop index if exists public.idx_worker_document_events_actor_id;
drop index if exists public.idx_worker_documents_updated_by;
drop index if exists public.idx_worker_skills_verified_by;
drop index if exists public.idx_project_worker_operational_statuses_updated_by;
drop index if exists public.idx_project_worker_operational_statuses_worker_id;
drop index if exists public.idx_project_worker_readiness_items_updated_by;
drop index if exists public.idx_project_worker_readiness_items_worker_id;
drop index if exists public.idx_job_demands_project_id;
drop index if exists public.idx_productivity_units_organization_id;
drop index if exists public.idx_profession_templates_organization_id;
drop index if exists public.idx_skill_icons_organization_id;
drop index if exists public.idx_projects_company_id;

commit;
