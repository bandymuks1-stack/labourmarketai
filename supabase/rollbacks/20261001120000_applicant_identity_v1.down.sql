-- Rollback for 20261001120000_applicant_identity_v1.sql
-- Removes the one read-only function; no data, table, grant or policy was
-- changed by the forward migration. After this the scouting view renders the
-- anonymized handle again (the app feature-detects the missing function).
drop function if exists public.applicant_identity_v1(uuid, uuid);
