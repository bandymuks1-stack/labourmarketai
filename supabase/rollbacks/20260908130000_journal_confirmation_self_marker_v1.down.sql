-- ROLLBACK for 20260908130000_journal_confirmation_self_marker_v1.sql
--
-- Removes the write-time marker and returns journal_entry_confirmations to a
-- table whose rows cannot say whether the confirmer was the entry's own
-- worker.
--
-- WARNING: this DROPS a column. That is safe here in exactly one sense — the
-- column is additive, carries no fact that exists anywhere else, and every
-- value in it was derived at write time from journal_entries + workers, so
-- dropping it destroys no independent evidence and the same fact can be
-- re-derived by the join. It is NOT safe in the sense of being free: any row
-- inserted while the column existed loses its recorded stamp, and after a
-- re-apply those rows would read NULL (not recorded) rather than their true
-- value, until they are re-derived.
--
-- No row is deleted. No policy or grant changes. The append-only posture is
-- unchanged in both directions.

drop trigger if exists z_journal_entry_confirmation_self_marker
  on public.journal_entry_confirmations;

drop function if exists public.journal_entry_confirmation_self_marker();

alter table public.journal_entry_confirmations
  drop column if exists self_confirmed;
