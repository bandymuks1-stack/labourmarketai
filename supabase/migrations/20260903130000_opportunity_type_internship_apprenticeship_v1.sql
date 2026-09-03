-- 20260903130000_opportunity_type_internship_apprenticeship_v1
--
-- Internship / apprenticeship as CANONICAL opportunity types (FIRST REAL
-- ECOSYSTEM USE, Track C — owner direction 2026-09-03: "make internship /
-- apprenticeship a proper canonical opportunity/demand type using the
-- smallest additive implementation; do not create a parallel student job
-- system").
--
-- The canonical slot already exists: `customer_requests.payload.structured_v2
-- .opportunity_type`. The worker-safe projection below allowlists its values,
-- so a demand marked 'internship' was silently dropped from what a worker or
-- a learner could see. This migration widens that allowlist by two values —
-- nothing else in the function changes (the body is re-declared verbatim from
-- 20260711330000 with the one list extended). The TypeScript mirrors
-- (OPPORTUNITY_TYPES in lib/demand/structured-demand-v2.ts and
-- lib/opportunities/structured-public.ts) carry the same two values.
--
-- Plain IMMUTABLE SQL function, no SECURITY DEFINER, no grant, no data change.
-- Reversible: see the ROLLBACK block and supabase/rollbacks/<same name>.down.sql
-- (re-declares the function with the previous five-value list; rows that carry
-- the new values simply stop being projected — nothing is deleted).

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
          ('employment','temporary_assignment','project_work','subcontract','service_request',
           'internship','apprenticeship')
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

-- ROLLBACK
-- (see supabase/rollbacks/20260903130000_opportunity_type_internship_apprenticeship_v1.down.sql)
-- re-declare public.demand_structured_v2_public(p jsonb) with the previous allowlist
-- ('employment','temporary_assignment','project_work','subcontract','service_request').
