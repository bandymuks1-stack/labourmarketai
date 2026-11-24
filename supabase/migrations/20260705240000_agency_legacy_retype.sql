-- ============================================================================
-- ALREADY APPLIED TO PRODUCTION — RESTORED FOR HISTORY PARITY 2026-08-18.
-- DO NOT RE-APPLY BY HAND. This file did not exist in the repository; the
-- statement below is the EXACT text production recorded in
-- `supabase_migrations.schema_migrations` for ledger row version
-- `20260705111011`, name `20260705240000_agency_legacy_retype`, recovered on
-- 2026-08-18 and restored so a rebuild-from-scratch reaches the same state.
--
-- WHY IT WAS MISSING. The 2026-07-05 lead session applied this via Supabase
-- MCP and renumbered the next migration
-- (`20260705250000_journal_photos_project_gallery.sql`) to avoid the timestamp
-- collision — but never committed the file itself. The full-project truth
-- audit of 2026-08-18 found it as the repository's only genuine migration
-- orphan (REQ-GOV-016). Everything else the audit flagged turned out to be a
-- split / union / follow-up apply of a file that DOES exist; see
-- `docs/migrations/production-parity-register.md`.
--
-- @human-gate-approved — TIER: owner-gated (data UPDATE). The approval is not
-- new and is not mine: the applied statement records it verbatim —
-- "APPROVED — apply agency legacy retype (3 rows)", owner, 2026-07-05.
-- This restoration adds no new authority; it writes down what was approved and
-- already executed.
--
-- SAFETY ON REPLAY, STATED PRECISELY (checked against production 2026-08-18):
--   * On a FRESH database (`supabase db reset`) this is a no-op — neither
--     `agencies` nor the matching `companies` rows exist yet at this point in
--     the migration order. That is the case this file exists to serve.
--   * Against CURRENT PRODUCTION it is NOT harmless, which is why the
--     DO-NOT-RE-APPLY notice above is not boilerplate. Of the three rows this
--     migration changed in 2026-07-05, `048aa7e1-…` has since been changed
--     back to `construction` by a later, legitimate action. Re-running the
--     statement today would silently overwrite that change. The `is distinct
--     from` guard makes the statement idempotent with respect to REPEATED
--     application; it does NOT make it safe against data that has since moved
--     on.
--   * It deletes nothing, in either case.
--
-- Rollback: supabase/rollbacks/20260705240000_agency_legacy_retype.down.sql
-- ============================================================================

-- 20260705240000 — agency legacy residual retype (branch 21 closure).
-- Applied via Supabase MCP after explicit owner approval
-- ("APPROVED — apply agency legacy retype (3 rows)", 2026-07-05).
-- Plan: runtime/audits/agency-legacy-residual-plan-2026-07-05.md
-- Rollback tuples captured pre-apply (restore these exact values):
--   048aa7e1-0c77-4484-ad7d-00eb1288d7e3 -> 'construction'
--   39b75887-3bdd-495a-8e47-7c9401086a47 -> 'other'
--   788225e9-035b-4ed3-9bce-bf19aab61b14 -> 'other'
-- No deletion; agencies + mirror orgs remain as archive; 0 membership rows.

update public.companies c
   set company_type = 'staffing_agency'
 where c.profile_id in (select a.profile_id from public.agencies a
                        where a.profile_id is not null)
   and c.company_type is distinct from 'staffing_agency';
