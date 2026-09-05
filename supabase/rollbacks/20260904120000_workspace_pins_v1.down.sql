-- DOWN for 20260904120000_workspace_pins_v1.sql
-- Preference references only (no domain state lives here); reversible verbatim.
begin;
drop policy if exists workspace_pins_delete on public.workspace_pins;
drop policy if exists workspace_pins_update on public.workspace_pins;
drop policy if exists workspace_pins_insert on public.workspace_pins;
drop policy if exists workspace_pins_select on public.workspace_pins;
drop index if exists public.workspace_pins_profile_idx;
drop index if exists public.workspace_pins_owner_ref_uidx;
drop table if exists public.workspace_pins;
commit;
