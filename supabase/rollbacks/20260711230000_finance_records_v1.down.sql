-- Rollback for 20260711230000_finance_records_v1.sql
--
-- Restores the prior state exactly: the up-migration created ONE new table
-- and THREE new functions and touched nothing else (no existing table,
-- policy, grant, trigger or RPC was modified or recreated). Dropping them
-- removes only feature-created rows (all finance rows live exclusively in
-- public.finance_records). The consuming app on main degrades honestly the
-- moment the table is gone (42P01 → "preparing" state, CSV export → 503).

begin;

drop function if exists public.set_finance_record_status_v1(text, text);
drop function if exists public.update_finance_record_v1(text, text, text, text, text, text);
drop function if exists public.create_finance_record_v1(text, text, text, text, text, text, text, text, text);

drop table if exists public.finance_records;

commit;
