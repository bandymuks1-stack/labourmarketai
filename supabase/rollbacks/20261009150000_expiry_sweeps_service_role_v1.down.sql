-- Rollback for 20261009150000_expiry_sweeps_service_role_v1.sql.
-- Safe: the functions own no data; rows already expired stay expired.
begin;
drop function if exists public.sweep_expire_stale_booking_requests_v1(uuid, integer);
drop function if exists public.sweep_expire_contact_disclosure_requests_v1(uuid);
commit;
