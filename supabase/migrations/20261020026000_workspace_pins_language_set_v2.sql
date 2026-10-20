-- 20261020026000_workspace_pins_language_set_v2
--
-- Forward fix of 20261020025000: the pin label's original_language CHECK
-- carried the 11 UI locales, but what a person may WRITE in is the
-- COMMUNICATION set — the UI locales plus uk and ka (owner RED-1 2026-09-17,
-- `communicationLocales` in lib/i18n/config.ts; guarded by
-- lib/guards/journal-integrity-guards-migration.test.ts, which reads the
-- authoritative set from the latest original_language CHECK). Widening only;
-- the table holds 0 rows. No RLS, grant or function change.
-- Rollback: supabase/rollbacks/20261020026000_workspace_pins_language_set_v2.down.sql

begin;

alter table public.workspace_pins drop constraint if exists workspace_pins_original_language_chk;
alter table public.workspace_pins
  add constraint workspace_pins_original_language_chk
    check (original_language is null
           or original_language in ('lt','en','pl','de','nl','lv','et','da','no','sv','ru','uk','ka'));

commit;
