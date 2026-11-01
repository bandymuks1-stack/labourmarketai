-- ============================================================================
-- MIGRATION ALREADY APPLIED IN PRODUCTION — NEVER MANUALLY RE-APPLY.
--
-- Production ledger version : 20261020040457
-- Production ledger name    : 20261020026000_workspace_pins_language_set_v2
-- Restored to repo          : 2026-11-01, for migration-history parity only. The live
--                             migration-parity gate (quality) found this ledger row with
--                             no repository file; the owner approved restoring the six
--                             such rows byte-exact (option 2, 2026-11-01).
-- Source of truth           : supabase_migrations.schema_migrations.statements of the row
--                             above, read 2026-11-01. Later-edited branch copies were NOT
--                             used as a source.
-- Parity proof              : everything after the marker line below is BYTE-EXACT to
--                             production's stored statements (326 bytes).
--                             md5 = 42787c90ab1a569a0112199aacee5ccb
--                             Verify: drop every line up to and including the marker line,
--                             then md5sum the remainder (no trailing newline).
-- ROLLBACK                  : supabase/rollbacks/20261020040457_20261020026000_workspace_pins_language_set_v2.down.sql — RECONSTRUCTED after the
--                             production apply; the ledger stored no rollback. Local
--                             development resets and repo governance only.
--
-- @human-gate-approved
-- HUMAN GATE SCOPE: restoration of HISTORICAL, ALREADY-PRODUCTION-APPLIED SQL only
-- (owner decision 2026-11-01, option 2; RED draft PR, owner approves the merge).
-- migration-safety findings expected for this file: drop-constraint with matching add-constraint (CHECK widening).
-- This annotation grants NO right to apply, re-apply or change anything in production.
-- ============================================================================
-- >>> PRODUCTION STATEMENTS BELOW (byte-exact; do not edit) <<<
alter table public.workspace_pins drop constraint if exists workspace_pins_original_language_chk;
alter table public.workspace_pins
  add constraint workspace_pins_original_language_chk
    check (original_language is null
           or original_language in ('lt','en','pl','de','nl','lv','et','da','no','sv','ru','uk','ka'));