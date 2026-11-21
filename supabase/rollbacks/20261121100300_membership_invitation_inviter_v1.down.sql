-- Rollback of 20261121100300_membership_invitation_inviter_v1.
-- Drops the v2 read; v1 (20260806120000_company_membership_commands_v1) was
-- never changed. The app falls back to v1 when v2 is absent. No rows change.

begin;

drop function if exists public.membership_my_invitations_v2();

commit;
