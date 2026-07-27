-- 20260727180000_journal_entry_skill_provenance_v1.sql
--
-- PR-C — stored provenance for journal entry ↔ skill evidence links.
--
-- PROBLEM (documented in apps/web/lib/journal/entry-skill-source.ts): the
-- `journal_entry_skills` link table records THAT an entry supports a skill,
-- but not HOW the link came to exist. The UI has to re-derive the source at
-- render time from indirect signals (current recognizer output, verified
-- flag), which cannot distinguish "the pipeline recognized this from the
-- text" from "the worker explicitly confirmed a candidate" from "the worker
-- manually linked a declared skill".
--
-- SOLUTION (smallest honest slice): ONE additive nullable column recording
-- the write-time provenance of each NEW link row:
--
--   'recognized'  — the journal skill pipeline auto-linked a skill it
--                   recognized from the entry text (verified stays false).
--   'confirmed'   — the worker explicitly confirmed a fuzzy / ambiguous /
--                   unresolved candidate (one-tap confirm trust boundary).
--   'manual'      — the worker manually linked one of their own declared
--                   skills to the entry.
--
-- HISTORIC ROWS: provenance stays NULL = "derived, pre-provenance". We do
-- NOT back-fill a guess — NULL is the honest statement that the write-time
-- source was never recorded, and the render-time derivation
-- (apps/web/lib/journal/entry-skill-source.ts) keeps covering those rows.
--
-- CLASS: GREEN — additive nullable column with a CHECK only. No new table,
-- no RLS change, no privilege change, no function, no trigger, no data DML,
-- no drop. Existing RLS on journal_entry_skills (owner-scoped) is untouched
-- and fully covers the new column.
--
-- APPLY: unapplied at merge time. Per the conditional prod-apply autonomy
-- (governance 2026-06-12) a GREEN classification permits MCP apply_migration
-- after merge; until applied, the app writes degrade honestly (they retry
-- without the column on undefined_column — see
-- apps/web/lib/journal/entry-skill-link-write.ts).
--
-- ROLLBACK (full script at
-- supabase/rollbacks/20260727180000_journal_entry_skill_provenance_v1.down.sql):
--   -- alter table public.journal_entry_skills drop column if exists provenance;

begin;

alter table public.journal_entry_skills
  add column if not exists provenance text
    check (provenance is null or provenance in ('recognized', 'confirmed', 'manual'));

comment on column public.journal_entry_skills.provenance is
  'Write-time origin of this evidence link: recognized (pipeline auto-link from entry text), confirmed (worker one-tap candidate confirm), manual (worker linked a declared skill). NULL = historic row written before this column existed; its source is derived at read time.';

commit;
