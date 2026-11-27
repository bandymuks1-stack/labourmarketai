-- Rollback for 20261123060000_revoke_bypassed_v1_doors_v1: restores the
-- EXECUTE grants exactly as their own migrations left them
-- (20261011200000:658, 20260711210000:254, 20261021095200:215).

grant execute on function public.respond_team_demand_offer_v1(uuid, text) to authenticated;
grant execute on function public.set_work_task_status_v1(text, text) to authenticated;
grant execute on function public.propose_booking_request(uuid, uuid, text, text, text, text, text) to authenticated;
