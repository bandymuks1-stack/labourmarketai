-- ROLLBACK for 20261020040457_20261020026000_workspace_pins_language_set_v2.sql
-- RECONSTRUCTED after the production apply; the production ledger stored NO rollback.
-- Intentionally a no-op. This restored migration REPEATS the change of the renumbered repo
-- copy 20261020025900_workspace_pins_language_set_v2.sql, which sorts before it and already
-- sets workspace_pins_original_language_chk to the same 13-code list. The state before this
-- migration therefore already holds that constraint; returning to the 11-code set is the
-- rollback of 20261020025900 (supabase/rollbacks/20261020025900_workspace_pins_language_set_v2.down.sql),
-- not of this file.
select 1;
