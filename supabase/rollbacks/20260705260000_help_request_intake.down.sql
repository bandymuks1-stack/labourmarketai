-- ============================================================================
-- DOWN — 20260705260000_help_request_intake (owner-run manual rollback).
--
-- The up migration added ONE new-name SECURITY DEFINER function
-- (submit_help_request_v1) and its grant — nothing else. It created no
-- table, no policy, no trigger and recreated no existing object, so the
-- down is exactly the one drop.
--
-- ROLLBACK-CHAIN RULE: no existing RPC/trigger was recreated; this file
-- therefore contains no create-function — there is no prior body to
-- restore. customer_requests rows created by the function (identifiable by
-- payload->>'help_type') are ordinary intake rows and are deliberately
-- KEPT as operator history (0001 append-audit doctrine).
-- ============================================================================

begin;

drop function if exists public.submit_help_request_v1(text, text, uuid);

commit;
