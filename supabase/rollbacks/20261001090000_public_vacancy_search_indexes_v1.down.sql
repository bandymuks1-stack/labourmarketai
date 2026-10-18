-- Rollback for 20261001090000_public_vacancy_search_indexes_v1
-- Drops ONLY the index the forward migration created. Indexes are derived
-- structures: no data impact. Apply via Supabase MCP apply_migration.

begin;

drop index if exists public.public_vacancies_active_board_cover_idx;

commit;
