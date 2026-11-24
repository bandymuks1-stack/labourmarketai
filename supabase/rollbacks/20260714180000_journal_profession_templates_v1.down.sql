-- Rollback for 20260714180000_journal_profession_templates_v1.sql — restores
-- the prior state exactly. The feature created ONE new table (the template
-- slug registry) plus its index, policies and grants; no existing table, RPC
-- or policy was touched, so dropping the table removes every feature-created
-- object. Data in it (template rows incl. any owner activations/edits) is
-- destroyed by this rollback — export first if the owner wants to keep it.
begin;

drop table if exists public.journal_profession_templates;

commit;
