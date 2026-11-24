-- DOWN / rollback for 20260613100000_worker_availability_preferences.sql
--
-- Removes the worker availability-preference RPC + the eight additive columns.
-- The columns are nullable preference fields (no truth-claim default), so
-- dropping them loses only optionally-entered preferences — not identity,
-- evidence, or money. Apply via Supabase MCP apply_migration, never `db push`.

begin;

drop function if exists public.save_worker_availability_prefs(
  boolean, boolean, boolean, integer, text, boolean, boolean, text);

alter table public.workers
  drop column if exists willing_to_relocate,
  drop column if exists needs_accommodation,
  drop column if exists has_transport,
  drop column if exists max_trip_days,
  drop column if exists preferred_contract_type,
  drop column if exists team_available,
  drop column if exists solo_available,
  drop column if exists availability_note;

commit;
