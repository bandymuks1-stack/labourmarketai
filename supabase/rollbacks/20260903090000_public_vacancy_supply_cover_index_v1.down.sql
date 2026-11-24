-- Rollback for 20260903090000_public_vacancy_supply_cover_index_v1
-- Safe: drops only the covering index added by the forward migration. No data is touched.

drop index if exists public.public_vacancies_active_supply_cover_idx;
