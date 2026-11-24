-- Rollback for 20260712120000_journal_entry_restore.sql
-- Drops only the restore RPC added by the up migration. No data change:
-- entries restored while the function existed keep deleted_at = null.

drop function if exists public.journal_entry_restore(uuid);
