-- DOWN / rollback for 20260612200000_phase_b2_fk_indexes.sql
--
-- Drops ONLY the 10 indexes created by the forward migration. Reversible,
-- no data impact. Apply via Supabase MCP apply_migration, never `db push`.

begin;

drop index if exists public.idx_worker_skills_skill_id;
drop index if exists public.idx_worker_skills_current_pace_unit_slug;
drop index if exists public.idx_worker_professions_profession_id;
drop index if exists public.idx_profession_skills_skill_id;
drop index if exists public.idx_esco_occupation_skills_skill_id;
drop index if exists public.idx_worker_documents_document_type_slug;
drop index if exists public.idx_country_document_requirements_document_type_slug;
drop index if exists public.idx_productivity_units_base_unit_slug;
drop index if exists public.idx_subscriptions_plan_id;
drop index if exists public.idx_organizations_country;

commit;
