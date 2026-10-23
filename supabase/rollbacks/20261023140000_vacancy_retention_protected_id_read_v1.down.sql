-- Rollback of 20261023140000_vacancy_retention_protected_id_read_v1: removes the two column grants.
-- The retention workflow then fails closed again on its protection read (it never deletes without it).
revoke select (public_vacancy_id) on public.worker_saved_opportunities from service_role;
revoke select (public_vacancy_id) on public.demand_interest_signals from service_role;
