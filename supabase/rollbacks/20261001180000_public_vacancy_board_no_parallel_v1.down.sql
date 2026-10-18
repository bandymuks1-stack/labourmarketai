-- Rollback for 20261001180000_public_vacancy_board_no_parallel_v1
-- Removes only the added per-function setting; search_path and work_mem stay.

alter function public.search_public_vacancy_previews_v1(text, text, integer, integer)
  reset max_parallel_workers_per_gather;

alter function public.count_public_vacancies_v1()
  reset max_parallel_workers_per_gather;
