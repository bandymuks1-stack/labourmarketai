-- 20261028123000_synthetic_demand_cross_org_readers_v1
--
-- RED tier (needs-human-gate): replaces THREE authenticated SECURITY DEFINER
-- readers (same signatures, same return shapes, same search_path, same
-- grants) and adds three small helpers. NOT applied — production apply
-- requires the owner's approval naming this PR. Deliberately carries NO
-- human-gate annotation: nothing is approved yet.
--
-- WHY (isolation audit 2026-10-28, production read-only): synthetic QA
-- organizations (owner-approved write proofs) are named with the documented
-- markers of apps/web/lib/qa/synthetic-fixture.ts. The TypeScript readers keep
-- other organizations' fixtures out of normal surfaces, but three SQL readers
-- return every open need (customer_requests, status 'submitted') to OTHER
-- organizations unfiltered:
--   list_open_demand_for_agencies()          agency board; returns no company
--                                            name, so TS cannot filter it
--                                            (lib/agency/pool.ts), and
--                                            mark_agency_can_offer can then
--                                            write on such a need
--   list_open_demand_for_workers()           worker board + market-map worker leg
--   list_open_demand_for_team_offer_v1(uuid) the needs a brigade / organization
--                                            may offer itself to
-- Production holds open synthetic needs that real agencies can see.
--
-- WHAT — ONE rule, applied where the rows are read (a reader does not forget):
--   is_synthetic_fixture_label_v1(variadic text[])  IMMUTABLE mirror of the
--       three MARKERS regexes in synthetic-fixture.ts (JS \b == ARE \y).
--   demand_is_synthetic_fixture_v1(org, profile)    the need's OWN organization
--       (display_name / legal_name) or its company (demand_company_id_v1, the
--       one demand-company rule of 20261020010000) carries a marker.
--   is_synthetic_viewer_v1()                        the server-set half of
--       isSyntheticViewer: app_metadata.qa_synthetic === true. The TS
--       fallback on the QA address shape is deliberately NOT mirrored: an
--       unverified JWT email is not proof of anything in SQL
--       (lib/guards/email-verified-boundary.test.ts), and app_metadata is
--       writable by the service role only.
-- Each reader gains ONE identical predicate: a fixture need is returned only
-- to (a) a synthetic viewer — a QA identity, or (agency / team readers) an
-- acting organization that is itself a fixture, the same rule as
-- lib/scouting/scouting.ts — so the production QA walks keep working, or
-- (b) the need's own people (its poster, or an owner/admin/manager of its
-- organization — has_org_demand_access): a person's OWN rows are never hidden.
-- Everything else in each body is the latest repo definition, unchanged:
--   list_open_demand_for_agencies            20261003150000_org2_agency_capability_authority_v1
--   list_open_demand_for_workers             20261020010000_demand_company_one_rule_v1 (ledger MATCH)
--   list_open_demand_for_team_offer_v1       20261020010000_demand_company_one_rule_v1 (ledger MATCH)
-- No row is written or deleted. Real organizations' needs are unaffected.
--
-- ROLLBACK: supabase/rollbacks/20261028123000_synthetic_demand_cross_org_readers_v1.down.sql
-- (restores the three bodies byte-for-byte and drops the three helpers).

begin;

-- ── helpers ──────────────────────────────────────────────────────────────
-- The markers, once. Keep EQUAL to MARKERS in apps/web/lib/qa/synthetic-fixture.ts
-- (pinned by lib/guards/synthetic-demand-cross-org-readers-v1.test.ts).
create or replace function public.is_synthetic_fixture_label_v1(variadic p_values text[])
returns boolean
language sql
immutable
parallel safe
set search_path to 'pg_catalog'
as $function$
  select coalesce(bool_or(
           v ~* '\yQA[-_ ]SYNTHETIC\y'
        or v ~* '\[E2E\]'
        or v ~* '\yE2E[-_ ]FIXTURE\y'
         ), false)
    from unnest(p_values) as v
   where v is not null and v <> ''
$function$;

-- Does the need's owning organization (or its company) carry a marker?
create or replace function public.demand_is_synthetic_fixture_v1(p_organization_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select coalesce((select public.is_synthetic_fixture_label_v1(o.display_name, o.legal_name)
                     from public.organizations o
                    where o.id = p_organization_id), false)
      or coalesce((select public.is_synthetic_fixture_label_v1(c.display_name, c.legal_name)
                     from public.companies c
                    where c.id = public.demand_company_id_v1(p_organization_id, p_profile_id)), false)
$function$;

-- Is the CALLER a documented synthetic QA identity? (isSyntheticViewer, the
-- server-set marker only — never the self-chosen email address.)
create or replace function public.is_synthetic_viewer_v1()
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select coalesce((auth.jwt() -> 'app_metadata' -> 'qa_synthetic') = 'true'::jsonb, false)
$function$;

-- Called only from inside the SECURITY DEFINER readers below (as their
-- owner); not API doors.
revoke all on function public.is_synthetic_fixture_label_v1(text[]) from public, anon, authenticated;
revoke all on function public.demand_is_synthetic_fixture_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_synthetic_viewer_v1() from public, anon, authenticated;

-- ── 1. agency board ──────────────────────────────────────────────────────
create or replace function public.list_open_demand_for_agencies()
returns table (
  id uuid,
  role_text text,
  country text,
  team_size integer,
  start_period text,
  duration text,
  created_at timestamptz,
  can_offer_marked boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_company uuid;
  v_legacy  uuid;
  v_sees_fixtures boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  v_company := public.caller_agency_company_id();
  if v_company is null then
    return;
  end if;
  select a.id into v_legacy from public.agencies a where a.profile_id = uid;
  -- A synthetic viewer (QA identity, or an agency that is itself a fixture)
  -- keeps seeing fixtures; everyone else does not (20261028123000).
  v_sees_fixtures := public.is_synthetic_viewer_v1()
    or exists (select 1 from public.companies c
                where c.id = v_company
                  and public.is_synthetic_fixture_label_v1(c.display_name, c.legal_name))
    or exists (select 1 from public.organizations o
                where o.legacy_company_id = v_company
                  and public.is_synthetic_fixture_label_v1(o.display_name, o.legal_name));

  return query
  select cr.id,
         cr.role_or_work_type,
         cr.country,
         cr.team_size,
         cr.start_period,
         cr.duration,
         cr.created_at,
         exists (
           select 1
           from jsonb_array_elements(
                  coalesce(cr.payload -> 'agency_offers', '[]'::jsonb)
                ) o
           where o ->> 'agency_id' = v_company::text
              or (v_legacy is not null and o ->> 'agency_id' = v_legacy::text)
         )
    from public.customer_requests cr
   where cr.status = 'submitted'
     -- DIRECTION OF THE MARKET (unchanged): demand only; a future supply kind
     -- is invisible by default. The null branch keeps the pre-kind rows (0028).
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
     -- SYNTHETIC QA FIXTURES (20261028123000): another organization's fixture
     -- need is not market reality. Kept for the need's own people and for a
     -- synthetic viewer (lib/qa/synthetic-fixture.ts).
     and (v_sees_fixtures
          or not public.demand_is_synthetic_fixture_v1(cr.organization_id, cr.profile_id)
          or cr.profile_id = uid
          or coalesce(public.has_org_demand_access(cr.organization_id), false))
   order by cr.created_at desc
   limit 100;
end
$$;

revoke all on function public.list_open_demand_for_agencies() from public, anon;
grant execute on function public.list_open_demand_for_agencies() to authenticated;

-- ── 2. worker board (and the market map's worker leg) ───────────────────
CREATE OR REPLACE FUNCTION public.list_open_demand_for_workers()
 RETURNS TABLE(id uuid, role_text text, country text, team_size integer, start_period text, accommodation text, created_at timestamp with time zone, company_name text, route_status text, location_label text, transport text, required_tools text[], structured jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid      uuid := auth.uid();
  v_worker uuid;
  v_sees_fixtures boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into v_worker from public.workers w where w.profile_id = uid;
  if v_worker is null then
    return; -- not a worker -> empty, never an error surface
  end if;
  -- A synthetic QA identity keeps seeing fixtures; nobody else (20261028123000).
  v_sees_fixtures := public.is_synthetic_viewer_v1();

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
         -- Worker-safe structured_v2 projection - SQL-side whitelist, never
         -- the raw payload (see demand_structured_v2_public).
         public.demand_structured_v2_public(cr.payload -> 'structured_v2')
           as structured
    from public.customer_requests cr
    -- THE NEED'S OWN COMPANY — the one rule (20261020010000).
    join public.companies c
      on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
     and c.verification_status = 'verified'
   where cr.status = 'submitted'
     -- DIRECTION OF THE MARKET (owner window 7 section 4). A worker board
     -- shows DEMAND. agency_offer is an agency offering the people it HAS -
     -- supply - and rendering it here presents an offer as a vacancy.
     -- Closed allow-list: a future supply kind is invisible by default.
     -- The null branch keeps the pre-kind buyer-spine rows (0028).
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
     -- SYNTHETIC QA FIXTURES (20261028123000): another organization's fixture
     -- need is not market reality. Kept for the need's own people and for a
     -- synthetic viewer (lib/qa/synthetic-fixture.ts).
     and (v_sees_fixtures
          or not public.demand_is_synthetic_fixture_v1(cr.organization_id, cr.profile_id)
          or cr.profile_id = uid
          or coalesce(public.has_org_demand_access(cr.organization_id), false))
   order by cr.created_at desc
   limit 100;
end
$function$;

revoke all on function public.list_open_demand_for_workers() from public, anon;
grant execute on function public.list_open_demand_for_workers() to authenticated;

-- ── 3. the needs a brigade / organization may offer itself to ─────────────
CREATE OR REPLACE FUNCTION public.list_open_demand_for_team_offer_v1(p_team_org_id uuid)
 RETURNS TABLE(request_id uuid, role_text text, country text, team_size integer, start_period text, company_name text, created_at timestamp with time zone, open_offer_id uuid, open_offer_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  v_sees_fixtures boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not coalesce((
       exists (select 1 from public.organizations o
                where o.id = p_team_org_id
                  and o.organization_type in ('team', 'company', 'agency'))
       and (public.manages_organization(p_team_org_id)
            or exists (select 1 from public.organizations o
                        where o.id = p_team_org_id and o.owner_profile_id = uid))
     ), false) then
    return;
  end if;
  -- A synthetic viewer (QA identity, or a team / organization that is itself
  -- a fixture) keeps seeing fixtures; everyone else does not (20261028123000).
  v_sees_fixtures := public.is_synthetic_viewer_v1()
    or exists (select 1 from public.organizations o
                where o.id = p_team_org_id
                  and public.is_synthetic_fixture_label_v1(o.display_name, o.legal_name));

  return query
  select cr.id,
         coalesce(nullif(btrim(cr.role_or_work_type), ''), nullif(btrim(cr.title), '')),
         cr.country,
         cr.team_size,
         cr.start_period,
         coalesce(nullif(trim(c.display_name), ''), nullif(trim(c.legal_name), '')),
         cr.created_at,
         o.id,
         o.status
    from public.customer_requests cr
    join public.companies c
      on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
     and c.verification_status = 'verified'
    left join public.team_demand_offers o
      on o.request_id = cr.id and o.team_org_id = p_team_org_id
     and o.status in ('offered', 'accepted')
   where cr.status = 'submitted'
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
     and cr.profile_id <> uid
     and not coalesce(public.has_org_demand_access(cr.organization_id), false)
     and cr.organization_id is distinct from p_team_org_id
     -- SYNTHETIC QA FIXTURES (20261028123000): another organization's fixture
     -- need is not market reality. Kept for the need's own people and for a
     -- synthetic viewer (lib/qa/synthetic-fixture.ts).
     and (v_sees_fixtures
          or not public.demand_is_synthetic_fixture_v1(cr.organization_id, cr.profile_id)
          or cr.profile_id = uid
          or coalesce(public.has_org_demand_access(cr.organization_id), false))
   order by cr.created_at desc
   limit 100;
end;
$function$;

revoke all on function public.list_open_demand_for_team_offer_v1(uuid) from public, anon;
grant execute on function public.list_open_demand_for_team_offer_v1(uuid) to authenticated;

commit;
