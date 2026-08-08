-- Rollback for 20260807120000_admin_grant_service_role_repair_v1.
--
-- Restores service_role to its prior state on these two tables — the
-- 20260702200000 column SELECTs ONLY. Deliberately does NOT revoke
-- select (id, active_role) on profiles or select (profile_id, role) on
-- profile_roles: those grants belong to 20260702200000 (the activation
-- report's read path) and are that migration's rollback to undo, not this
-- one's.
--
-- Effect of running this: the founder admin-grant scripts fail loudly again
-- with "permission denied for table profiles" — exactly the pre-repair
-- state. Idempotent: revoking an absent grant is a no-op.

begin;

revoke update (active_role) on public.profiles from service_role;
revoke select (email) on public.profiles from service_role;

revoke insert (profile_id, role) on public.profile_roles from service_role;
revoke update (profile_id, role) on public.profile_roles from service_role;

commit;
