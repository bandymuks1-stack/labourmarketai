-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after owner + Chat Claude review.
-- Never `db push` (repo filenames ≠ ledger versions → re-run hazard).
--
-- Pre-payment readiness sprint (PR2) — Worker availability PREFERENCES.
-- Answers product-question #3 ("when / under what conditions is the worker
-- free?"). PURELY ADDITIVE: new nullable columns on public.workers + one
-- owner-scoped SECURITY DEFINER write RPC. The existing save_worker_card RPC
-- and availability_status/available_from columns are UNTOUCHED.
--
-- Honesty invariants:
--   * all new columns are nullable with no default truth-claim — an unset pref
--     means "not stated", never a fabricated yes/no;
--   * no readiness score is stored here — readiness is derived in the app layer
--     from these real fields (doctrine §6).
-- ============================================================================

-- @human-gate-approved
begin;

alter table public.workers
  add column if not exists willing_to_relocate     boolean,
  add column if not exists needs_accommodation      boolean,
  add column if not exists has_transport            boolean,
  add column if not exists max_trip_days            integer
    check (max_trip_days is null or (max_trip_days > 0 and max_trip_days <= 3650)),
  add column if not exists preferred_contract_type  text
    check (preferred_contract_type is null or preferred_contract_type in
      ('employment','subcontract','temporary','any')),
  add column if not exists team_available           boolean,
  add column if not exists solo_available           boolean,
  add column if not exists availability_note         text
    check (availability_note is null or char_length(availability_note) <= 2000);

-- Owner-scoped write RPC (the only write path for these prefs). Mirrors the
-- save_worker_card hardening standard: search_path pinned, direct table writes
-- already governed by existing workers RLS (self-update).
create or replace function public.save_worker_availability_prefs(
  p_willing_to_relocate    boolean,
  p_needs_accommodation    boolean,
  p_has_transport          boolean,
  p_max_trip_days          integer,
  p_preferred_contract_type text,
  p_team_available         boolean,
  p_solo_available         boolean,
  p_availability_note      text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  w_id uuid;
  v_contract text := nullif(trim(coalesce(p_preferred_contract_type, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_contract is not null and v_contract not in
       ('employment','subcontract','temporary','any') then
    raise exception 'Invalid contract type' using errcode = '22023';
  end if;
  if p_max_trip_days is not null and (p_max_trip_days <= 0 or p_max_trip_days > 3650) then
    raise exception 'Invalid max trip days' using errcode = '22023';
  end if;

  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  update public.workers w
     set willing_to_relocate    = p_willing_to_relocate,
         needs_accommodation    = p_needs_accommodation,
         has_transport          = p_has_transport,
         max_trip_days          = p_max_trip_days,
         preferred_contract_type = v_contract,
         team_available         = p_team_available,
         solo_available         = p_solo_available,
         availability_note      = nullif(trim(coalesce(p_availability_note, '')), ''),
         updated_at             = now()
   where w.id = w_id;

  return w_id;
end;
$$;
revoke all on function public.save_worker_availability_prefs(
  boolean, boolean, boolean, integer, text, boolean, boolean, text) from public;
grant execute on function public.save_worker_availability_prefs(
  boolean, boolean, boolean, integer, text, boolean, boolean, text) to authenticated;

commit;

-- ROLLBACK: see supabase/rollbacks/20260613100000_worker_availability_preferences.down.sql
-- (drops the RPC + the eight added columns; columns are nullable so no data
--  guarantee is lost on reverse).
