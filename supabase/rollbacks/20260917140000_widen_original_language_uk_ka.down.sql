-- DOWN / rollback for 20260917140000_widen_original_language_uk_ka.sql
--
-- Restores the 11-locale original_language CHECK sets (removes 'uk'/'ka') on all
-- four tables. Paired reversal required by the rollback-file rule
-- (migration-safety check `q`).
--
-- WARNING: fails (by design, loudly) if any 'uk'/'ka' row exists in the
-- meantime — those rows must be re-languaged or removed first. Silently
-- dropping the constraint while such data exists would leave invalid rows
-- behind. Run via Supabase MCP apply_migration, never `db push`.

begin;

alter table public.journal_entries
  drop constraint if exists journal_entries_original_language_chk;
alter table public.journal_entries
  add constraint journal_entries_original_language_chk
  check (original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl','ru')) not valid;
alter table public.journal_entries
  validate constraint journal_entries_original_language_chk;

alter table public.conversation_messages
  drop constraint if exists conversation_messages_original_language_chk;
alter table public.conversation_messages
  add constraint conversation_messages_original_language_chk
  check (original_language is null
         or original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl','ru')) not valid;
alter table public.conversation_messages
  validate constraint conversation_messages_original_language_chk;

alter table public.organization_evidence_records
  drop constraint if exists organization_evidence_records_original_language_chk;
alter table public.organization_evidence_records
  add constraint organization_evidence_records_original_language_chk
  check (original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl','ru')) not valid;
alter table public.organization_evidence_records
  validate constraint organization_evidence_records_original_language_chk;

alter table public.candidate_skills
  drop constraint if exists candidate_skills_original_language_chk;
alter table public.candidate_skills
  add constraint candidate_skills_original_language_chk
  check (original_language in ('en','lt','lv','et','nl','de','da','no','sv','pl','ru')) not valid;
alter table public.candidate_skills
  validate constraint candidate_skills_original_language_chk;

commit;
