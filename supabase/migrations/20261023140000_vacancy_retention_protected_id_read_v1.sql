-- Vacancy retention can see which vacancies people still hold on to.
--
-- .github/workflows/vacancy-retention.yml protects every vacancy that a person saved or raised a hand
-- on before it removes expired rows, because worker_saved_opportunities and demand_interest_signals
-- reference public_vacancies with ON DELETE CASCADE. The protection read runs as service_role, and
-- service_role holds no SELECT on those two tables, so the dry run of 2026-10-23 failed closed
-- (403) and the retention job can never run while ~110k expired rows stay in public_vacancies.
--
-- Least privilege: SELECT on the ONE column the protection read selects (public_vacancy_id). No
-- person, worker, text or timestamp column; no RLS change; nothing for anon or authenticated.
grant select (public_vacancy_id) on public.worker_saved_opportunities to service_role;
grant select (public_vacancy_id) on public.demand_interest_signals to service_role;
