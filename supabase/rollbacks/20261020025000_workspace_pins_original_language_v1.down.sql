-- ROLLBACK for 20261020025000_workspace_pins_original_language_v1.sql
begin;
alter table public.workspace_pins drop constraint if exists workspace_pins_label_language_chk;
alter table public.workspace_pins drop constraint if exists workspace_pins_original_language_chk;
alter table public.workspace_pins drop column if exists original_language;
commit;
