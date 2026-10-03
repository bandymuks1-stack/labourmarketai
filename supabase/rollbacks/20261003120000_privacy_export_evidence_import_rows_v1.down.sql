-- Rollback for 20261003120000_privacy_export_evidence_import_rows_v1
-- Drops the read-only subject-export function. It owns no data and no table
-- depends on it (the app reports evidence_import_rows as "unavailable" again).
drop function if exists public.privacy_export_evidence_import_rows_v1();
