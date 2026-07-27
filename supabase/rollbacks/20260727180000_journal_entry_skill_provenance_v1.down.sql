-- ROLLBACK for 20260727180000_journal_entry_skill_provenance_v1.sql
--
-- Drops ONLY what that migration created: the nullable `provenance` column on
-- public.journal_entry_skills (its inline CHECK goes with it). The link rows
-- themselves are untouched. NOTE: dropping the column discards any stamped
-- provenance values — after a rollback those links read as "derived,
-- pre-provenance" again (the render-time derivation still covers them, and
-- the TS write path degrades automatically to unstamped inserts).
--
-- Apply manually only when reverting — per repo convention via Supabase MCP /
-- SQL editor, never `db push`.

begin;

alter table public.journal_entry_skills
  drop column if exists provenance;

commit;
