-- Rollback for 20260712200000_canonical_invitations_v1.sql
-- Reverses the additive objects only. NOTE: dropping the table removes
-- invitation RECORDS; canonical relationships already created by accepted
-- invitations (engagement_contexts rows / project_worker_assignments rows)
-- are REAL memberships and are deliberately NOT deleted — reversing a
-- person's membership is a separate human decision, never a rollback side
-- effect.

drop function if exists public.list_invitations_for_me_v1();
drop function if exists public.decline_invitation_v1(text);
drop function if exists public.accept_invitation_by_id_v1(uuid);
drop function if exists public.accept_invitation_v1(text);
drop function if exists public.get_invitation_preview_v1(text);
drop function if exists public.mark_invitation_delivery_v1(uuid, text);
drop function if exists public.resend_invitation_v1(uuid, text);
drop function if exists public.revoke_invitation_v1(uuid);
drop function if exists public.create_invitation_v1(text, text, text, text, uuid, uuid, text, text, text);

drop table if exists public.invitations;
