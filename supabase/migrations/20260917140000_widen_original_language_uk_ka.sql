-- ============================================================================
-- 20260917140000 — widen original_language CHECK sets: add 'uk' + 'ka'.
-- @human-gate-approved  (RED: schema change; owner-approved 2026-09-17, RED-1)
--
-- WHY: owner decision RED-1 (2026-09-17). UI_LANGUAGE != COMMUNICATION_LANGUAGE:
-- a person may AUTHOR a work message in Ukrainian or Georgian and the platform
-- must PRESERVE that original language even though no full /uk or /ka UI route
-- exists yet. Canonical source of truth: apps/web/lib/i18n/config.ts
-- `communicationLocales` (= UI `locales` + 'uk' + 'ka'). Full decision packet:
-- docs/launch/OWNER_GATE_MESSAGE_LANGUAGE_SET_2026-09-17.md.
--
-- User content stays original_text + original_language only (§2 — no translation
-- columns); this migration ONLY widens the accepted language codes. No RLS
-- change, no data change, no new column, no authority change.
--
-- Four tables carry an original_language CHECK today (verified 2026-09-17 via
-- pg_constraint): journal_entries, conversation_messages,
-- organization_evidence_records, candidate_skills. All are char(2)/text — a
-- two-letter 'uk'/'ka' fits with no type change.
--
-- SAFETY: widening only — every previously-valid row stays valid, so the
-- VALIDATE steps cannot fail on existing data. Each `drop constraint` is a
-- re-add with a strictly wider set, not a removal of protection. Guard
-- lib/guards/message-language-set.test.ts + journal-integrity-guards-migration
-- FAIL if this set and `communicationLocales` ever drift.
--
-- Rollback: supabase/rollbacks/20260917140000_widen_original_language_uk_ka.down.sql
-- Apply via Supabase MCP apply_migration — never `db push`.
-- ============================================================================

begin;

-- 1. journal_entries (NOT NULL set).
alter table public.journal_entries
  drop constraint if exists journal_entries_original_language_chk;
alter table public.journal_entries
  add constraint journal_entries_original_language_chk
  check (original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl','ru','uk','ka')) not valid;
alter table public.journal_entries
  validate constraint journal_entries_original_language_chk;

-- 2. conversation_messages (nullable: NULL = language unknown, kept). Both
--    observed constraint names dropped so this works on prod (…_chk) and a
--    fresh local stack (auto-named …_check).
alter table public.conversation_messages
  drop constraint if exists conversation_messages_original_language_chk;
alter table public.conversation_messages
  drop constraint if exists conversation_messages_original_language_check;
alter table public.conversation_messages
  add constraint conversation_messages_original_language_chk
  check (original_language is null
         or original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl','ru','uk','ka')) not valid;
alter table public.conversation_messages
  validate constraint conversation_messages_original_language_chk;

-- 3. organization_evidence_records (NOT NULL set; observed name …_check).
alter table public.organization_evidence_records
  drop constraint if exists organization_evidence_records_original_language_check;
alter table public.organization_evidence_records
  drop constraint if exists organization_evidence_records_original_language_chk;
alter table public.organization_evidence_records
  add constraint organization_evidence_records_original_language_chk
  check (original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl','ru','uk','ka')) not valid;
alter table public.organization_evidence_records
  validate constraint organization_evidence_records_original_language_chk;

-- 4. candidate_skills (NOT NULL set, inline check auto-name).
alter table public.candidate_skills
  drop constraint if exists candidate_skills_original_language_check;
alter table public.candidate_skills
  drop constraint if exists candidate_skills_original_language_chk;
alter table public.candidate_skills
  add constraint candidate_skills_original_language_chk
  check (original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl','ru','uk','ka')) not valid;
alter table public.candidate_skills
  validate constraint candidate_skills_original_language_chk;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual — see the paired .down.sql). Restores the 11-locale sets.
-- Fails loudly if any 'uk'/'ka' row exists: those rows must be handled first.
-- ─────────────────────────────────────────────────────────────────────────
