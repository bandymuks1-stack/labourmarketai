-- Rollback of 20261001120000: the sweep reverts to `unavailable`.
begin;
revoke select on table public.worker_professions from service_role;
revoke select on table public.professions from service_role;
commit;
