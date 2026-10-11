-- Rollback for 20261009150000_expiry_sweeps_service_role_v1.sql.
-- Safe: the functions own no data; rows already expired stay expired.
-- The SYSTEM IDENTITY (auth user + profile) is NOT dropped here: once audit
-- events reference it, deleting it would fail (FK without ON DELETE) or erase
-- history. Ban it instead if it must stop existing in practice.
begin;
drop function if exists public.sweep_expire_stale_booking_requests_v1(integer);
drop function if exists public.sweep_expire_contact_disclosure_requests_v1();
drop function if exists public._expiry_sweep_assert_actor_v1();
drop function if exists public.expiry_sweep_actor_id_v1();
commit;
