-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260711270000 — worker preference columns v2 (marketplace precision
-- programme, decision pack MP-2; gap map
-- docs/launch/marketplace-precision-booking-gap-map-v1.md §2/§9).
--
-- PROBLEM: the mirrored worker side of the structured demand contract is
-- missing the counterpart facts for several matching criteria that demands
-- can now state (structured_v2): gross/net expectation basis, night/weekend
-- shift and overtime willingness, driving-licence categories, own vehicle,
-- own tools. Without them those criteria stay "insufficient data" for every
-- worker.
--
-- SOLUTION (smallest honest slice): SEVEN additive NULLABLE columns on the
-- EXISTING canonical `workers` row (no second capability store) + ONE new
-- versioned write RPC. All nullable: NULL = "not stated" — the UI never
-- collapses that to false, and matching treats NULL as missing data, never
-- as a "no".
--
--   pay_basis_preference        'gross' | 'net'      (expectation basis for
--                                salary_min_eur/max — NOT a new salary store)
--   night_shifts_ok             boolean
--   weekend_shifts_ok           boolean
--   overtime_ok                 boolean
--   driving_licence_categories  text[] ⊆ {B,BE,C,CE,D} (same closed set as
--                                structured_v2 transport.licence_categories)
--   own_vehicle                 boolean (distinct from has_transport, which
--                                conflates "can get to work" with ownership)
--   own_tools                   boolean
--
-- WRITE PATH: save_worker_availability_prefs_v2 — a NEW function name (the
-- applied v1 RPC keeps its exact signature and callers; nothing breaks if
-- only one of the two is applied). Owner-scoped, SECURITY DEFINER,
-- search_path pinned, closed-set re-validation, tri-state honoured.
--
-- ABUSE BOUNDS: closed enum + bounded array (≤5 fixed values); no free text.
-- COMPATIBILITY / BACKFILL: none — additive nullable columns; every existing
-- row reads back unchanged with NULL = not stated.
-- ROLLBACK: paired 20260711270000_worker_preference_columns_v2.down.sql
-- drops the v2 function and the seven columns only.
--
-- POST-APPLY VERIFICATION:
--   select save_worker_availability_prefs_v2(true,null,null,14,'employment',
--     true,true,null,'net',true,false,null,array['B','CE'],true,null);
--   select pay_basis_preference, night_shifts_ok, driving_licence_categories
--     from workers where profile_id = auth.uid();
--   + APPLIED_LEDGER.md row.
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER function +
-- grants = RED-class; annotation downgrades the CI finding only — the OWNER
-- still applies manually).
-- ============================================================================

begin;

alter table public.workers
  add column if not exists pay_basis_preference text
    check (pay_basis_preference is null or pay_basis_preference in ('gross','net')),
  add column if not exists night_shifts_ok boolean,
  add column if not exists weekend_shifts_ok boolean,
  add column if not exists overtime_ok boolean,
  add column if not exists driving_licence_categories text[]
    check (
      driving_licence_categories is null
      or driving_licence_categories <@ array['B','BE','C','CE','D']::text[]
    ),
  add column if not exists own_vehicle boolean,
  add column if not exists own_tools boolean;

create or replace function public.save_worker_availability_prefs_v2(
  p_willing_to_relocate       boolean,
  p_needs_accommodation       boolean,
  p_has_transport             boolean,
  p_max_trip_days             integer,
  p_preferred_contract_type   text,
  p_team_available            boolean,
  p_solo_available            boolean,
  p_availability_note         text,
  p_pay_basis_preference      text,
  p_night_shifts_ok           boolean,
  p_weekend_shifts_ok         boolean,
  p_overtime_ok               boolean,
  p_driving_licence_categories text[],
  p_own_vehicle               boolean,
  p_own_tools                 boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  w_id uuid;
  v_contract text := nullif(trim(coalesce(p_preferred_contract_type, '')), '');
  v_basis    text := nullif(trim(coalesce(p_pay_basis_preference, '')), '');
  v_licences text[] := p_driving_licence_categories;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_contract is not null and v_contract not in
       ('employment','subcontract','temporary','any') then
    raise exception 'Invalid contract type' using errcode = '22023';
  end if;
  if v_basis is not null and v_basis not in ('gross','net') then
    raise exception 'Invalid pay basis' using errcode = '22023';
  end if;
  if p_max_trip_days is not null and (p_max_trip_days <= 0 or p_max_trip_days > 3650) then
    raise exception 'Invalid max trip days' using errcode = '22023';
  end if;
  if v_licences is not null then
    if array_length(v_licences, 1) = 0 then
      v_licences := null;
    elsif not (v_licences <@ array['B','BE','C','CE','D']::text[]) then
      raise exception 'Invalid licence category' using errcode = '22023';
    end if;
  end if;

  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  update public.workers w
     set willing_to_relocate        = p_willing_to_relocate,
         needs_accommodation        = p_needs_accommodation,
         has_transport              = p_has_transport,
         max_trip_days              = p_max_trip_days,
         preferred_contract_type    = v_contract,
         team_available             = p_team_available,
         solo_available             = p_solo_available,
         availability_note          = nullif(trim(coalesce(p_availability_note, '')), ''),
         pay_basis_preference       = v_basis,
         night_shifts_ok            = p_night_shifts_ok,
         weekend_shifts_ok          = p_weekend_shifts_ok,
         overtime_ok                = p_overtime_ok,
         driving_licence_categories = v_licences,
         own_vehicle                = p_own_vehicle,
         own_tools                  = p_own_tools,
         updated_at                 = now()
   where w.id = w_id;

  return w_id;
end;
$$;

revoke all on function public.save_worker_availability_prefs_v2(
  boolean, boolean, boolean, integer, text, boolean, boolean, text,
  text, boolean, boolean, boolean, text[], boolean, boolean) from public;
grant execute on function public.save_worker_availability_prefs_v2(
  boolean, boolean, boolean, integer, text, boolean, boolean, text,
  text, boolean, boolean, boolean, text[], boolean, boolean) to authenticated;

commit;
