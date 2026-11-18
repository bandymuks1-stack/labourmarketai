-- Rollback for 20261025180000_public_vacancies_importer_cover_indexes_v1
-- Drops ONLY the two indexes the forward migration created. Indexes are
-- derived structures: no data impact. The reads fall back to the plans they
-- used before (Seq Scan / unique-key Index Scan). Apply via Supabase MCP
-- apply_migration.

begin;

drop index if exists public.public_vacancies_provider_external_cover_idx;
drop index if exists public.public_vacancies_provider_active_idx;

commit;
