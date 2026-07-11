-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260711330000 — worker demand structured_v2 exposure (marketplace
-- precision programme Phase 2, decision pack MP-3; gap map §1/§9; owner
-- directive: "expose full structured demand data to workers while
-- respecting privacy").
--
-- PROBLEM: since PR #719 companies capture rich structured demand facts
-- (payload.structured_v2: engagement, time, compensation with gross/net +
-- itemized deductions, accommodation detail, transport split, requirements,
-- process) — but the worker board RPC exposes only the original narrow
-- whitelist. Workers decide on pay/time/conditions they cannot see.
--
-- SOLUTION: ONE helper + ONE recreated RPC.
--
--   1. public.demand_structured_v2_public(p jsonb) — an IMMUTABLE pure
--      projection that rebuilds ONLY the worker-safe subset of a stored
--      structured_v2 cluster, key by key, with per-key type/enum validation
--      done IN SQL (defence in depth: the app-side zod sanitizer is the
--      normal writer, but submit_demand_request accepts payload jsonb from
--      any authenticated client, so worker exposure must not trust stored
--      shape). Anything outside a closed vocabulary, any wrong JSON type,
--      and EVERY free-text field is dropped element-by-element.
--
--      DELIBERATELY EXCLUDED (free text / not worker-safe):
--        worksite_type, right_to_work_notes, required_permits,
--        compensation.overtime_rate_note, compensation.bonuses_note,
--        deductions[].note, requirements.certificates (bounded owner text —
--        excluded until a certificate taxonomy exists),
--        requirements.education / equipment_permissions /
--        physical_conditions / medical_prerequisites, process.decision_owner,
--        meta. Plus the standing exclusions of this RPC: free-text
--        title/need_summary/notes/payload.role/location, contacts, ids,
--        address_text/locality.
--
--   2. list_open_demand_for_workers() recreated byte-identical to the
--      applied 20260705210000 definition PLUS one column:
--        structured jsonb — demand_structured_v2_public(payload->'structured_v2'),
--        NULL when absent/invalid (the board shows the current narrow facts,
--        an honest "not provided" for the rest).
--
-- PRIVACY: worker-only caller gate, verified-company Model-A join, RLS on
-- customer_requests untouched, no contact data, no free text, coarse
-- location only — all unchanged. The exposed subset is enums, bounded
-- numbers, ISO dates and booleans ONLY.
--
-- COMPATIBILITY: additive column; the merged loader tolerates its absence
-- AND its presence (readStructuredDemandPublic degrades to null). No
-- backfill (projection is computed at read time).
--
-- ROLLBACK: paired 20260711330000_worker_demand_structured_v2_exposure.down.sql
-- restores the applied 20260705210000 RPC definition VERBATIM and drops the
-- helper.
--
-- POST-APPLY VERIFICATION:
--   As a worker: select id, structured from list_open_demand_for_workers() limit 3;
--     → structured is NULL or contains ONLY whitelisted keys; no note/title
--       text anywhere in the output.
--   select public.demand_structured_v2_public(
--     '{"compensation":{"min_cents":1450,"basis":"gross","bonuses_note":"secret"},"worksite_type":"leak"}'::jsonb);
--     → {"compensation":{"min_cents":1450,"basis":"gross"}} (no note, no worksite_type).
--   + APPLIED_LEDGER.md row.
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER recreate +
-- GRANT are RED-class; annotation downgrades the CI finding only — the
-- OWNER still applies manually).
-- ============================================================================

begin;

-- 1. Pure worker-safe projection of a stored structured_v2 cluster ----------

create or replace function public.demand_structured_v2_public(p jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case when p is null or jsonb_typeof(p) <> 'object' then null else
    nullif(jsonb_strip_nulls(jsonb_build_object(
      'opportunity_type',
        case when p ->> 'opportunity_type' in
          ('employment','temporary_assignment','project_work','subcontract','service_request')
        then p ->> 'opportunity_type' end,
      'target_supply',
        case when p ->> 'target_supply' in
          ('individual','multiple_workers','team','company')
        then p ->> 'target_supply' end,
      'site_mode',
        case when p ->> 'site_mode' in ('single','multiple','mobile')
        then p ->> 'site_mode' end,
      'work_mode',
        case when p ->> 'work_mode' in ('onsite','remote','hybrid')
        then p ->> 'work_mode' end,
      'engagement_form',
        case when p ->> 'engagement_form' in
          ('direct_employment','agency_employment','temporary_employment',
           'posted_worker','self_employed_contractor','company_subcontract')
        then p ->> 'engagement_form' end,
      'contract_country',
        case when p ->> 'contract_country' ~ '^[A-Z]{2}$'
        then p ->> 'contract_country' end,
      'probation_days',
        case when jsonb_typeof(p -> 'probation_days') = 'number'
        then p -> 'probation_days' end,
      'time',
        case when jsonb_typeof(p -> 'time') = 'object' then
          nullif(jsonb_strip_nulls(jsonb_build_object(
            'start_earliest',
              case when p -> 'time' ->> 'start_earliest' ~ '^\d{4}-\d{2}-\d{2}$'
              then p -> 'time' ->> 'start_earliest' end,
            'start_latest',
              case when p -> 'time' ->> 'start_latest' ~ '^\d{4}-\d{2}-\d{2}$'
              then p -> 'time' ->> 'start_latest' end,
            'end_date',
              case when p -> 'time' ->> 'end_date' ~ '^\d{4}-\d{2}-\d{2}$'
              then p -> 'time' ->> 'end_date' end,
            'extension_possible',
              case when jsonb_typeof(p -> 'time' -> 'extension_possible') = 'boolean'
              then p -> 'time' -> 'extension_possible' end,
            'hours_per_week',
              case when jsonb_typeof(p -> 'time' -> 'hours_per_week') = 'number'
              then p -> 'time' -> 'hours_per_week' end,
            'min_guaranteed_hours',
              case when jsonb_typeof(p -> 'time' -> 'min_guaranteed_hours') = 'number'
              then p -> 'time' -> 'min_guaranteed_hours' end,
            'shifts',
              case when jsonb_typeof(p -> 'time' -> 'shifts') = 'array' then
                (select nullif(jsonb_agg(to_jsonb(v) order by v), '[]'::jsonb)
                   from jsonb_array_elements_text(p -> 'time' -> 'shifts') as v
                  where v in ('day','night','weekend')) end,
            'overtime_expected',
              case when jsonb_typeof(p -> 'time' -> 'overtime_expected') = 'boolean'
              then p -> 'time' -> 'overtime_expected' end,
            'schedule_notice_days',
              case when jsonb_typeof(p -> 'time' -> 'schedule_notice_days') = 'number'
              then p -> 'time' -> 'schedule_notice_days' end,
            'application_deadline',
              case when p -> 'time' ->> 'application_deadline' ~ '^\d{4}-\d{2}-\d{2}$'
              then p -> 'time' ->> 'application_deadline' end,
            'expected_response_days',
              case when jsonb_typeof(p -> 'time' -> 'expected_response_days') = 'number'
              then p -> 'time' -> 'expected_response_days' end
          )), '{}'::jsonb) end,
      'compensation',
        case when jsonb_typeof(p -> 'compensation') = 'object' then
          nullif(jsonb_strip_nulls(jsonb_build_object(
            'min_cents',
              case when jsonb_typeof(p -> 'compensation' -> 'min_cents') = 'number'
              then p -> 'compensation' -> 'min_cents' end,
            'max_cents',
              case when jsonb_typeof(p -> 'compensation' -> 'max_cents') = 'number'
              then p -> 'compensation' -> 'max_cents' end,
            'currency',
              case when p -> 'compensation' ->> 'currency' ~ '^[A-Z]{3}$'
              then p -> 'compensation' ->> 'currency' end,
            'basis',
              case when p -> 'compensation' ->> 'basis' in ('gross','net','unspecified')
              then p -> 'compensation' ->> 'basis' end,
            'unit',
              case when p -> 'compensation' ->> 'unit' in
                ('hour','day','week','month','project')
              then p -> 'compensation' ->> 'unit' end,
            'guaranteed_base_cents',
              case when jsonb_typeof(p -> 'compensation' -> 'guaranteed_base_cents') = 'number'
              then p -> 'compensation' -> 'guaranteed_base_cents' end,
            'per_diem_cents',
              case when jsonb_typeof(p -> 'compensation' -> 'per_diem_cents') = 'number'
              then p -> 'compensation' -> 'per_diem_cents' end,
            'payment_frequency',
              case when p -> 'compensation' ->> 'payment_frequency' in
                ('weekly','biweekly','monthly')
              then p -> 'compensation' ->> 'payment_frequency' end,
            'first_payment_days',
              case when jsonb_typeof(p -> 'compensation' -> 'first_payment_days') = 'number'
              then p -> 'compensation' -> 'first_payment_days' end,
            'no_deductions',
              case when jsonb_typeof(p -> 'compensation' -> 'no_deductions') = 'boolean'
              then p -> 'compensation' -> 'no_deductions' end,
            'deductions',
              case when jsonb_typeof(p -> 'compensation' -> 'deductions') = 'array' then
                (select nullif(jsonb_agg(d), '[]'::jsonb)
                   from (
                     select nullif(jsonb_strip_nulls(jsonb_build_object(
                       'kind',
                         case when e ->> 'kind' in
                           ('accommodation','transport','insurance','other')
                         then e ->> 'kind' end,
                       'amount_cents',
                         case when jsonb_typeof(e -> 'amount_cents') = 'number'
                         then e -> 'amount_cents' end,
                       'period',
                         case when e ->> 'period' in ('day','week','month','once')
                         then e ->> 'period' end
                     )), '{}'::jsonb) as d
                       from jsonb_array_elements(p -> 'compensation' -> 'deductions') as e
                      where jsonb_typeof(e) = 'object'
                        and e ->> 'kind' in
                          ('accommodation','transport','insurance','other')
                   ) deds
                  where d is not null) end
          )), '{}'::jsonb) end,
      'accommodation',
        case when jsonb_typeof(p -> 'accommodation') = 'object' then
          nullif(jsonb_strip_nulls(jsonb_build_object(
            'state',
              case when p -> 'accommodation' ->> 'state' in
                ('offered','not_offered','not_needed')
              then p -> 'accommodation' ->> 'state' end,
            'payer',
              case when p -> 'accommodation' ->> 'payer' in ('employer','shared','worker')
              then p -> 'accommodation' ->> 'payer' end,
            'price_cents',
              case when jsonb_typeof(p -> 'accommodation' -> 'price_cents') = 'number'
              then p -> 'accommodation' -> 'price_cents' end,
            'price_period',
              case when p -> 'accommodation' ->> 'price_period' in ('day','week','month')
              then p -> 'accommodation' ->> 'price_period' end,
            'room',
              case when p -> 'accommodation' ->> 'room' in ('single','shared')
              then p -> 'accommodation' ->> 'room' end,
            'occupancy_per_room',
              case when jsonb_typeof(p -> 'accommodation' -> 'occupancy_per_room') = 'number'
              then p -> 'accommodation' -> 'occupancy_per_room' end,
            'distance_km',
              case when jsonb_typeof(p -> 'accommodation' -> 'distance_km') = 'number'
              then p -> 'accommodation' -> 'distance_km' end,
            'travel_minutes',
              case when jsonb_typeof(p -> 'accommodation' -> 'travel_minutes') = 'number'
              then p -> 'accommodation' -> 'travel_minutes' end,
            'amenities',
              case when jsonb_typeof(p -> 'accommodation' -> 'amenities') = 'array' then
                (select nullif(jsonb_agg(to_jsonb(v) order by v), '[]'::jsonb)
                   from jsonb_array_elements_text(p -> 'accommodation' -> 'amenities') as v
                  where v in ('kitchen','laundry','internet')) end,
            'registration_possible',
              case when jsonb_typeof(p -> 'accommodation' -> 'registration_possible') = 'boolean'
              then p -> 'accommodation' -> 'registration_possible' end,
            'deposit_cents',
              case when jsonb_typeof(p -> 'accommodation' -> 'deposit_cents') = 'number'
              then p -> 'accommodation' -> 'deposit_cents' end,
            'family_possible',
              case when jsonb_typeof(p -> 'accommodation' -> 'family_possible') = 'boolean'
              then p -> 'accommodation' -> 'family_possible' end,
            'available_from',
              case when p -> 'accommodation' ->> 'available_from' ~ '^\d{4}-\d{2}-\d{2}$'
              then p -> 'accommodation' ->> 'available_from' end
          )), '{}'::jsonb) end,
      'transport',
        case when jsonb_typeof(p -> 'transport') = 'object' then
          nullif(jsonb_strip_nulls(jsonb_build_object(
            'international_travel',
              case when p -> 'transport' ->> 'international_travel' in
                ('provided','compensated','not_provided','unknown')
              then p -> 'transport' ->> 'international_travel' end,
            'arrival_pickup',
              case when jsonb_typeof(p -> 'transport' -> 'arrival_pickup') = 'boolean'
              then p -> 'transport' -> 'arrival_pickup' end,
            'daily',
              case when p -> 'transport' ->> 'daily' in
                ('provided','compensated','not_provided','unknown')
              then p -> 'transport' ->> 'daily' end,
            'between_sites',
              case when p -> 'transport' ->> 'between_sites' in
                ('provided','compensated','not_provided','unknown')
              then p -> 'transport' ->> 'between_sites' end,
            'company_vehicle',
              case when jsonb_typeof(p -> 'transport' -> 'company_vehicle') = 'boolean'
              then p -> 'transport' -> 'company_vehicle' end,
            'fuel_card',
              case when jsonb_typeof(p -> 'transport' -> 'fuel_card') = 'boolean'
              then p -> 'transport' -> 'fuel_card' end,
            'own_vehicle_required',
              case when jsonb_typeof(p -> 'transport' -> 'own_vehicle_required') = 'boolean'
              then p -> 'transport' -> 'own_vehicle_required' end,
            'licence_categories',
              case when jsonb_typeof(p -> 'transport' -> 'licence_categories') = 'array' then
                (select nullif(jsonb_agg(to_jsonb(v) order by v), '[]'::jsonb)
                   from jsonb_array_elements_text(p -> 'transport' -> 'licence_categories') as v
                  where v in ('B','BE','C','CE','D')) end,
            'driver_supplement',
              case when jsonb_typeof(p -> 'transport' -> 'driver_supplement') = 'boolean'
              then p -> 'transport' -> 'driver_supplement' end,
            'return_travel_contribution',
              case when jsonb_typeof(p -> 'transport' -> 'return_travel_contribution') = 'boolean'
              then p -> 'transport' -> 'return_travel_contribution' end
          )), '{}'::jsonb) end,
      'requirements',
        case when jsonb_typeof(p -> 'requirements') = 'object' then
          nullif(jsonb_strip_nulls(jsonb_build_object(
            'min_experience_years',
              case when jsonb_typeof(p -> 'requirements' -> 'min_experience_years') = 'number'
              then p -> 'requirements' -> 'min_experience_years' end,
            'similar_project_experience',
              case when jsonb_typeof(p -> 'requirements' -> 'similar_project_experience') = 'boolean'
              then p -> 'requirements' -> 'similar_project_experience' end,
            'independent_work',
              case when jsonb_typeof(p -> 'requirements' -> 'independent_work') = 'boolean'
              then p -> 'requirements' -> 'independent_work' end,
            'drawings_reading',
              case when jsonb_typeof(p -> 'requirements' -> 'drawings_reading') = 'boolean'
              then p -> 'requirements' -> 'drawings_reading' end,
            'leadership',
              case when jsonb_typeof(p -> 'requirements' -> 'leadership') = 'boolean'
              then p -> 'requirements' -> 'leadership' end,
            'languages',
              case when jsonb_typeof(p -> 'requirements' -> 'languages') = 'array' then
                (select nullif(jsonb_agg(l), '[]'::jsonb)
                   from (
                     select nullif(jsonb_strip_nulls(jsonb_build_object(
                       'lang',
                         case when e ->> 'lang' in
                           ('en','lt','lv','et','nl','de','da','no','sv','pl','ru')
                         then e ->> 'lang' end,
                       'level',
                         case when e ->> 'level' in ('A1','A2','B1','B2','C1','C2')
                         then e ->> 'level' end,
                       'one_per_team_sufficient',
                         case when jsonb_typeof(e -> 'one_per_team_sufficient') = 'boolean'
                         then e -> 'one_per_team_sufficient' end
                     )), '{}'::jsonb) as l
                       from jsonb_array_elements(p -> 'requirements' -> 'languages') as e
                      where jsonb_typeof(e) = 'object'
                        and e ->> 'lang' in
                          ('en','lt','lv','et','nl','de','da','no','sv','pl','ru')
                        and e ->> 'level' in ('A1','A2','B1','B2','C1','C2')
                   ) langs
                  where l is not null) end,
            'own_tools',
              case when jsonb_typeof(p -> 'requirements' -> 'own_tools') = 'boolean'
              then p -> 'requirements' -> 'own_tools' end,
            'own_vehicle',
              case when jsonb_typeof(p -> 'requirements' -> 'own_vehicle') = 'boolean'
              then p -> 'requirements' -> 'own_vehicle' end,
            'own_workwear',
              case when jsonb_typeof(p -> 'requirements' -> 'own_workwear') = 'boolean'
              then p -> 'requirements' -> 'own_workwear' end
          )), '{}'::jsonb) end,
      'process',
        case when jsonb_typeof(p -> 'process') = 'object' then
          nullif(jsonb_strip_nulls(jsonb_build_object(
            'application_method',
              case when p -> 'process' ->> 'application_method' in
                ('interest_signal','conversation')
              then p -> 'process' ->> 'application_method' end,
            'interview_stages',
              case when jsonb_typeof(p -> 'process' -> 'interview_stages') = 'number'
              then p -> 'process' -> 'interview_stages' end,
            'practical_test',
              case when jsonb_typeof(p -> 'process' -> 'practical_test') = 'boolean'
              then p -> 'process' -> 'practical_test' end,
            'document_verification',
              case when jsonb_typeof(p -> 'process' -> 'document_verification') = 'boolean'
              then p -> 'process' -> 'document_verification' end,
            'response_deadline_days',
              case when jsonb_typeof(p -> 'process' -> 'response_deadline_days') = 'number'
              then p -> 'process' -> 'response_deadline_days' end,
            'listing_kind',
              case when p -> 'process' ->> 'listing_kind' in
                ('active_vacancy','talent_pool')
              then p -> 'process' ->> 'listing_kind' end
          )), '{}'::jsonb) end
    )), '{}'::jsonb)
  end
$$;

revoke all on function public.demand_structured_v2_public(jsonb) from public;
grant execute on function public.demand_structured_v2_public(jsonb) to authenticated;

-- 2. Recreate the worker board RPC — prior definition + ONE structured column

drop function if exists public.list_open_demand_for_workers();

create or replace function public.list_open_demand_for_workers()
returns table (
  id             uuid,
  role_text      text,
  country        text,
  team_size      int,
  start_period   text,
  accommodation  text,
  created_at     timestamptz,
  company_name   text,
  route_status   text,
  location_label text,
  transport      text,
  required_tools text[],
  structured     jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_worker uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into v_worker from public.workers w where w.profile_id = uid;
  if v_worker is null then
    return; -- not a worker → empty, never an error surface
  end if;

  return query
  select cr.id,
         cr.role_or_work_type,
         cr.country,
         cr.team_size,
         cr.start_period,
         case
           when cr.payload ->> 'accommodation' in (
             'provided_free', 'provided_paid', 'provided_deducted',
             'not_provided', 'yes', 'no', 'unknown'
           ) then cr.payload ->> 'accommodation'
           else null
         end as accommodation,
         cr.created_at,
         coalesce(
           nullif(trim(c.display_name), ''),
           nullif(trim(c.legal_name), '')
         ) as company_name,
         'approved_direct_partner'::text as route_status,
         coalesce(
           (select nullif(trim(coalesce(cdl.city, cdl.location_label)), '')
              from public.company_demand_locations cdl
             where cdl.request_id = cr.id
               and cdl.active
             order by cdl.updated_at desc
             limit 1),
           nullif(trim(cr.location), '')
         ) as location_label,
         case
           when cr.payload ->> 'transport' in (
             'provided', 'compensated', 'not_provided', 'unknown'
           ) then cr.payload ->> 'transport'
           else null
         end as transport,
         case
           when jsonb_typeof(cr.payload -> 'required_tools') = 'array' then
             (select array_agg(v order by v)
                from jsonb_array_elements_text(cr.payload -> 'required_tools') as v
               where v in (
                 'bulldozer-operator', 'compactor-operator', 'crane-operator',
                 'equipment-operation', 'excavator-operator',
                 'forklift-operator', 'grader-operator', 'hand-tools',
                 'loader-operator', 'scaffolding'
               ))
           else null
         end as required_tools,
         -- Worker-safe structured_v2 projection — SQL-side whitelist, never
         -- the raw payload (see demand_structured_v2_public).
         public.demand_structured_v2_public(cr.payload -> 'structured_v2')
           as structured
    from public.customer_requests cr
    join public.companies c
      on c.profile_id = cr.profile_id
     and c.verification_status = 'verified'
   where cr.status = 'submitted'
   order by cr.created_at desc
   limit 100;
end $$;

revoke all on function
  public.list_open_demand_for_workers() from public;
grant execute on function
  public.list_open_demand_for_workers() to authenticated;

commit;
