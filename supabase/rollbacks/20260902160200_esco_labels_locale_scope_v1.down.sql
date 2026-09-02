-- ============================================================================
-- ROLLBACK for 20260902160200_esco_labels_locale_scope_v1
--
-- Removes the prune function. Rows deleted by a NON-dry run are restored by
-- re-importing the affected locales from the ESCO release:
--   node scripts/esco/import-esco.mjs --locales <comma-separated locales>
-- (idempotent on the unique key; nothing user-generated lives in esco_labels).
-- ============================================================================

drop function if exists public.esco_labels_prune_locales_v1(text[], boolean);
