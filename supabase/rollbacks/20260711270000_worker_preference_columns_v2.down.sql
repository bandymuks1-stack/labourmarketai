-- Rollback for 20260711270000_worker_preference_columns_v2.sql — drops ONLY
-- what that migration created: the v2 function and the seven additive
-- columns. The applied v1 columns/RPC are untouched. Apply manually via
-- Supabase MCP after owner approval, never `db push`.

begin;

drop function if exists public.save_worker_availability_prefs_v2(
  boolean, boolean, boolean, integer, text, boolean, boolean, text,
  text, boolean, boolean, boolean, text[], boolean, boolean);

alter table public.workers
  drop column if exists pay_basis_preference,
  drop column if exists night_shifts_ok,
  drop column if exists weekend_shifts_ok,
  drop column if exists overtime_ok,
  drop column if exists driving_licence_categories,
  drop column if exists own_vehicle,
  drop column if exists own_tools;

commit;
