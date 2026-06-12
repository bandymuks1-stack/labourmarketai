-- DOWN / rollback for 20260612130000_widen_original_language_ru.sql
--
-- Restores the 10-locale original_language CHECK sets (removes 'ru'). Applied
-- to prod 2026-06-12 (forward migration self-applied via MCP under the
-- conditional prod-apply autonomy rule). This down script is the paired
-- reversal required by the rollback-file rule (migration-safety check `q`).
--
-- WARNING: this fails (by design, loudly) if any 'ru' rows exist in the
-- meantime — those rows must be re-languaged or removed first. That is correct:
-- silently dropping the constraint while 'ru' data exists would leave invalid
-- rows behind. Run via Supabase MCP apply_migration, never `db push`.

begin;

alter table public.journal_entries
  drop constraint if exists journal_entries_original_language_chk;
alter table public.journal_entries
  add constraint journal_entries_original_language_chk
  check (original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl')) not valid;
alter table public.journal_entries
  validate constraint journal_entries_original_language_chk;

alter table public.conversation_messages
  drop constraint if exists conversation_messages_original_language_chk;
alter table public.conversation_messages
  add constraint conversation_messages_original_language_chk
  check (original_language is null
         or original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl')) not valid;
alter table public.conversation_messages
  validate constraint conversation_messages_original_language_chk;

alter table public.candidate_skills
  drop constraint if exists candidate_skills_original_language_chk;
alter table public.candidate_skills
  add constraint candidate_skills_original_language_chk
  check (original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl')) not valid;
alter table public.candidate_skills
  validate constraint candidate_skills_original_language_chk;

commit;
