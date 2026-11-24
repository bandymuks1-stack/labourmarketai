-- Rollback for 20260903070000_public_vacancy_board_index_and_count_work_mem_v1
-- Safe: drops only the index added by the forward migration and resets the
-- function-scoped work_mem. No data is touched.

drop index if exists public.public_vacancies_active_published_idx;

alter function public.count_public_vacancies_v1() reset work_mem;
