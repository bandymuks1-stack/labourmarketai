-- ROLLBACK of 20261018150000_employer_profile_views_v1
-- Drops only what the migration created. employer_profile_views / organization_access_grants rows are
-- lost on rollback; export them first if the owner wants to keep the counts or VIP history.
begin;
drop function if exists public.record_worker_profile_view_v1(uuid, uuid);
drop function if exists public.revoke_organization_vip_v1(uuid);
drop function if exists public.set_organization_vip_v1(uuid, int, text);
drop table if exists public.employer_profile_views;
drop table if exists public.organization_access_grants;
drop function if exists public.caller_has_worker_relation_v1(uuid);
commit;
