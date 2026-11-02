-- ============================================================================
-- ROLLBACK of 20261003151500_invitation_v1_doors_not_api_callable_v1
--
-- Restores the production ACL read on 2026-10-04: postgres + authenticated
-- (never anon / public). No body, table or data is touched in either
-- direction. NOTE: re-granting reopens the multi-use exhaustion defect the
-- migration closes; it is only for backing the change out.
-- ============================================================================
grant execute on function public.accept_invitation_v1(text) to authenticated;
grant execute on function public.accept_invitation_by_id_v1(uuid) to authenticated;
grant execute on function public.decline_invitation_v1(text) to authenticated;
