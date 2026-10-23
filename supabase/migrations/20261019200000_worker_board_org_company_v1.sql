-- 20261019200000_worker_board_org_company_v1
--
-- @human-gate-approved (acknowledgement: RED by SECURITY DEFINER body replace)
--
-- RED CLASS — SECURITY DEFINER body replace. Draft PR + `needs-human-gate`
-- + owner approval, applied via Supabase MCP `apply_migration`. Never
-- `supabase db push`. Grants are kept by CREATE OR REPLACE.
--
-- ── WHAT IS WRONG ON PRODUCTION TODAY ────────────────────────────────────
--
-- `list_open_demand_for_workers()` (the worker opportunity board) finds a
-- need's company through the PERSON who posted it:
--
--     join companies c on c.profile_id = cr.profile_id
--
-- A person may own several companies (multi-organization, decision 0012), and
-- every need now carries the organization it belongs to
-- (`customer_requests.organization_id`). Joining by person therefore returns
-- each need ONCE PER VERIFIED COMPANY THAT PERSON OWNS, each copy under a
-- different company name — a need posted in one company is also shown as a
-- vacancy of the other.
--
-- Measured on production 2026-10-19 (read-only):
--   submitted demand rows of a board kind           17
--   rows with organization_id null                   0
--   board rows today / distinct needs               18 / 14   (4 duplicates)
--   board rows with this fix / distinct needs       14 / 14
--   needs lost / needs gained                         0 / 0
--   (need, company) pairs that were wrong            4
--
-- ── THE FIX ──────────────────────────────────────────────────────────────
-- The company is the need's OWN organization's company
-- (`organizations.legacy_company_id`). The person join stays only for a
-- legacy row without an organization (none today), so nothing that is
-- visible now becomes invisible. The verification gate, the `kind`
-- allow-list (20260906140000), the projection and the limit are unchanged.
--
-- Rollback: supabase/rollbacks/20261019200000_worker_board_org_company_v1.down.sql

begin;

CREATE OR REPLACE FUNCTION public.list_open_demand_for_workers()
 RETURNS TABLE(id uuid, role_text text, country text, team_size integer, start_period text, accommodation text, created_at timestamp with time zone, company_name text, route_status text, location_label text, transport text, required_tools text[], structured jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid      uuid := auth.uid();
  v_worker uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into v_worker from public.workers w where w.profile_id = uid;
  if v_worker is null then
    return; -- not a worker -> empty, never an error surface
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
         -- Worker-safe structured_v2 projection - SQL-side whitelist, never
         -- the raw payload (see demand_structured_v2_public).
         public.demand_structured_v2_public(cr.payload -> 'structured_v2')
           as structured
    from public.customer_requests cr
    -- THE NEED'S OWN COMPANY (20261019200000): through its organization, so a
    -- person who owns several companies does not multiply their needs. The
    -- person join is kept only for a legacy row with no organization.
    left join public.organizations o
      on o.id = cr.organization_id
    join public.companies c
      on c.verification_status = 'verified'
     and (
       (cr.organization_id is not null and c.id = o.legacy_company_id)
       or (cr.organization_id is null and c.profile_id = cr.profile_id)
     )
   where cr.status = 'submitted'
     -- DIRECTION OF THE MARKET (owner window 7 section 4). A worker board
     -- shows DEMAND. agency_offer is an agency offering the people it HAS -
     -- supply - and rendering it here presents an offer as a vacancy.
     -- Closed allow-list: a future supply kind is invisible by default.
     -- The null branch keeps the pre-kind buyer-spine rows (0028).
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
   order by cr.created_at desc
   limit 100;
end
$function$;

-- The privilege set production already has (authenticated only), re-asserted
-- so a local reset cannot inherit a default PUBLIC/anon EXECUTE.
revoke all on function public.list_open_demand_for_workers() from public, anon;
grant execute on function public.list_open_demand_for_workers() to authenticated;

commit;
