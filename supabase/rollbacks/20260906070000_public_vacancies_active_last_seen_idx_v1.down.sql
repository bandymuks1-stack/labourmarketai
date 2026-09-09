-- Rollback for 20260906070000_public_vacancies_active_last_seen_idx_v1
-- Safe: drops only the index added by the forward migration. No data is
-- touched; the freshness read falls back to the sort it used before.

drop index if exists public.public_vacancies_active_last_seen_idx;
