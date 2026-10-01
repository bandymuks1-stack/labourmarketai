-- Rollback for 20261001200000_public_vacancy_profession_published_idx_v1
-- Drops only the index the forward migration created; no data impact.

begin;

drop index if exists public.public_vacancies_active_profession_board_idx;

commit;
