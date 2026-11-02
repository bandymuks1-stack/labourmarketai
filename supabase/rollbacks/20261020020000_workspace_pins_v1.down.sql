-- DOWN for 20261020020000_workspace_pins_v1.sql
-- Preference references only (no domain state lives here); reversible verbatim.
begin;
do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is not null then
    delete from public.privacy_erasure_registry_v3
     where schema_name = 'public' and table_name = 'workspace_pins' and column_name = 'profile_id';
  end if;
end $$;
drop policy if exists workspace_pins_delete on public.workspace_pins;
drop policy if exists workspace_pins_update on public.workspace_pins;
drop policy if exists workspace_pins_insert on public.workspace_pins;
drop policy if exists workspace_pins_select on public.workspace_pins;
drop index if exists public.workspace_pins_profile_idx;
drop index if exists public.workspace_pins_owner_ref_uidx;
drop table if exists public.workspace_pins;
drop function if exists public.workspace_pins_cap_v1();
commit;
