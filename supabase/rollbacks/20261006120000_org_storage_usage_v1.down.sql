-- Rollback for 20261006120000_org_storage_usage_v1.sql
-- Drops the two read-only functions. Safe at any time: nothing depends on
-- them in the database; the web client degrades to a documents-only total
-- (usage RPC) and to "no journal quota" (entry-org RPC) with a warning.

begin;
drop function if exists public.org_storage_journal_entry_org_v1(uuid);
drop function if exists public.org_storage_used_bytes_v1(uuid);
commit;
