-- Rollback of 20261112180000_decline_invitation_by_id_v1.
-- Removes the one function the migration added. Decisions already recorded through it stay: they
-- are ordinary invitation_acceptances / invitations / audit_logs rows, identical to the ones
-- decline_invitation_v2 writes. No table, policy or other function is touched.
revoke all on function public.decline_invitation_by_id_v1(uuid) from authenticated;
drop function if exists public.decline_invitation_by_id_v1(uuid);
