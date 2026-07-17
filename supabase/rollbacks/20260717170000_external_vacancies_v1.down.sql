-- Rollback for 20260717170000_external_vacancies_v1.sql — restores the
-- prior state exactly. The feature created ONE new table (its policy +
-- index); external vacancy rows live only in that table, so dropping it
-- removes every feature-created object. No existing table/RPC/policy was
-- touched. Consumers feature-detect the absence (42P01) and degrade
-- honestly: the external-vacancies section simply does not render, exactly
-- as before the apply.
begin;

drop policy if exists external_vacancies_select_active on public.external_vacancies;
drop index if exists external_vacancies_active_published_idx;
drop table if exists public.external_vacancies;

commit;
