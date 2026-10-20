-- ROLLBACK for 20261020025900_workspace_pins_language_set_v2.sql
-- Back to the 11-code set. Refuses while a label is stored in uk or ka.
begin;
do $$
begin
  if exists (select 1 from public.workspace_pins where original_language in ('uk','ka')) then
    raise exception 'rollback refused: pin labels exist in uk/ka';
  end if;
end $$;
alter table public.workspace_pins drop constraint if exists workspace_pins_original_language_chk;
alter table public.workspace_pins
  add constraint workspace_pins_original_language_chk
    check (original_language is null
           or original_language in ('lt','en','pl','de','nl','lv','et','da','no','sv','ru'));
commit;
