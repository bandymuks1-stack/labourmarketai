-- ROLLBACK for 20260817180000_employee_requests_v1.sql
--
-- Restores the prior state exactly: drops ONLY the three module commands and
-- the employee_requests table. No existing object was touched by the up
-- migration, so nothing is recreated here. Engine instances that were started
-- through this module live in the engine's own tables and remain governed by
-- the engine (they complete/withdraw/cancel through engine commands as any
-- other instance; their context_entity_id simply no longer resolves).
--
-- Feature-created rows live ONLY in employee_requests; dropping the table is
-- the complete data rollback for this module.

begin;

drop function if exists public.sync_employee_request_status_v1(text);
drop function if exists public.withdraw_employee_request_v1(text, text);
drop function if exists public.create_employee_request_v1(text, text, text, text, text, text);

drop table if exists public.employee_requests;

commit;
