-- Rollback for 20261006130000_email_send_ledger_v1.sql
-- Drops the reserve RPC and the ledger. The ledger holds only hashed,
-- 24h-relevant reservation rows (no business data); losing it only resets the
-- caps. The app fails OPEN when the RPC is absent, so rolling back is safe.
begin;
drop function if exists public.reserve_email_send_v1(uuid, uuid, text, text, integer, integer, integer);
drop table if exists public.email_send_ledger_v1;
commit;
