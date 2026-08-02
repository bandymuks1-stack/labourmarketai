-- Rollback for 20260802160000_org_membership_revocation_v1.
--
-- The migration added exactly ONE new function and recreated nothing, so the
-- rollback drops that one function and restores nothing else.
--
-- DELIBERATELY NOT REVERSED: memberships that were already ended stay ended.
-- `engagement_contexts.status = 'ended'` is a legitimate business state that
-- existed in the 0013 CHECK long before this migration; re-activating those
-- rows would silently RE-GRANT organization authority (manages_organization,
-- journal access, invitation sending) to people an owner deliberately removed.
-- A rollback must never do that. The audit_logs rows are append-only and are
-- likewise left in place.

drop function if exists public.end_org_membership_v1(uuid, text);
