-- ============================================================================
-- 20260612130000 — widen original_language CHECK sets: add 'ru' (11th locale).
--
-- WHY: RU becomes an ACTIVE platform locale (owner goal 2026-06-12 — most
-- workers on the first real sites operate primarily in Russian; doctrine §2.4
-- amended to 11 locales, see PLATFORM_DOCTRINE §9 changelog). User content
-- stays original_text + original_language only (§2 — no translation columns);
-- this migration ONLY widens the accepted language codes so journal/chat/skill
-- write paths can store 'ru'. No RLS change, no data change, no new column.
--
-- SOURCE OF TRUTH: apps/web/lib/i18n/config.ts `locales` (§2.4). The guard
-- test journal-integrity-guards-migration.test.ts FAILS if this set and
-- config.ts ever drift.
--
-- Three tables carry an original_language CHECK today (verified on prod
-- 2026-06-12 via pg_constraint):
--   journal_entries.journal_entries_original_language_chk        (NOT NULL set)
--   conversation_messages.conversation_messages_original_language_chk
--     (prod name; the local/repo migration auto-names it
--      conversation_messages_original_language_check — both dropped below)
--   candidate_skills.candidate_skills_original_language_check    (NOT NULL set)
--
-- SAFETY: widening only — every previously-valid row stays valid, so the
-- VALIDATE steps cannot fail on existing data. `drop constraint` here is a
-- re-add with a strictly wider set, not a removal of protection.
-- ============================================================================

begin;

-- 1. journal_entries — widen to the 11-locale set.
alter table public.journal_entries
  drop constraint if exists journal_entries_original_language_chk;
alter table public.journal_entries
  add constraint journal_entries_original_language_chk
  check (original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl','ru')) not valid;
alter table public.journal_entries
  validate constraint journal_entries_original_language_chk;

-- 2. conversation_messages — widen (column is nullable: NULL = language
--    unknown on historical rows, kept). Both observed constraint names are
--    dropped so this works on prod (…_chk) and on a fresh local stack
--    (auto-named …_check by the inline column definition).
alter table public.conversation_messages
  drop constraint if exists conversation_messages_original_language_chk;
alter table public.conversation_messages
  drop constraint if exists conversation_messages_original_language_check;
alter table public.conversation_messages
  add constraint conversation_messages_original_language_chk
  check (original_language is null
         or original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl','ru')) not valid;
alter table public.conversation_messages
  validate constraint conversation_messages_original_language_chk;

-- 3. candidate_skills — widen (NOT NULL column, inline check auto-name).
alter table public.candidate_skills
  drop constraint if exists candidate_skills_original_language_check;
alter table public.candidate_skills
  drop constraint if exists candidate_skills_original_language_chk;
alter table public.candidate_skills
  add constraint candidate_skills_original_language_chk
  check (original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl','ru')) not valid;
alter table public.candidate_skills
  validate constraint candidate_skills_original_language_chk;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (manual — copy-paste). Restores the 10-locale CHECK sets exactly.
-- NOTE: rollback fails (by design, loudly) if any 'ru' rows were written in
-- the meantime — those rows would have to be handled explicitly first.
-- ─────────────────────────────────────────────────────────────────────────
--   begin;
--   alter table public.journal_entries
--     drop constraint if exists journal_entries_original_language_chk;
--   alter table public.journal_entries
--     add constraint journal_entries_original_language_chk
--     check (original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl')) not valid;
--   alter table public.journal_entries
--     validate constraint journal_entries_original_language_chk;
--   alter table public.conversation_messages
--     drop constraint if exists conversation_messages_original_language_chk;
--   alter table public.conversation_messages
--     add constraint conversation_messages_original_language_chk
--     check (original_language is null
--            or original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl')) not valid;
--   alter table public.conversation_messages
--     validate constraint conversation_messages_original_language_chk;
--   alter table public.candidate_skills
--     drop constraint if exists candidate_skills_original_language_chk;
--   alter table public.candidate_skills
--     add constraint candidate_skills_original_language_chk
--     check (original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl')) not valid;
--   alter table public.candidate_skills
--     validate constraint candidate_skills_original_language_chk;
--   commit;
