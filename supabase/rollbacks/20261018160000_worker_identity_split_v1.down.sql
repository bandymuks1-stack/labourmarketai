-- ROLLBACK of 20261018160000_worker_identity_split_v1
-- Restores the previous workers_select policy (can_view_worker, including the discoverability branch)
-- and removes the discovery projection. caller_has_worker_relation_v1 is KEPT: the same function is
-- also created by 20261018150000_employer_profile_views_v1 and may be in use there; it grants nothing
-- on its own.
begin;
drop policy if exists workers_select on public.workers;
create policy workers_select on public.workers
  for select using (public.can_view_worker(id));
drop function if exists public.list_discoverable_worker_profiles_v1(uuid[]);
commit;
