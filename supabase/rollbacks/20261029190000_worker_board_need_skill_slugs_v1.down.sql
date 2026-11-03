-- Rollback for 20261029190000_worker_board_need_skill_slugs_v1
-- Restores public.list_open_demand_for_workers() exactly as
-- 20261028123000_synthetic_demand_cross_org_readers_v1 defined it (ledger
-- 20261028161106) — the block below is that migration's text byte-for-byte
-- (pinned by lib/guards/worker-board-need-skill-slugs-v1.test.ts), so the
-- synthetic-fixture predicate, signature, STABLE SECURITY DEFINER,
-- search_path and grants are back as they were. DROP first: the forward
-- migration widened RETURNS TABLE, which CREATE OR REPLACE cannot narrow.
-- The dependent RLS policy demand_interest_signals_worker_insert is dropped
-- and recreated verbatim (20261021095100) around it, in the same transaction.
-- No data impact (neither direction writes a row). Rows that carry
-- payload.need_skills keep it; the restored reader simply does not read it.
-- Apply via Supabase MCP apply_migration — never `supabase db push`.

begin;

-- THE ONE SQL DEPENDANT: the worker-insert policy of demand_interest_signals
-- (20261021095100) reads this function, so DROP FUNCTION refuses while it
-- exists. It is dropped and recreated VERBATIM around the recreate, in this
-- same transaction (the table lock is held until commit — no session ever
-- sees the table without it). Its check reads only b.id, which is unchanged.
drop policy if exists demand_interest_signals_worker_insert
  on public.demand_interest_signals;

drop function if exists public.list_open_demand_for_workers();

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
-- Same ACL everywhere: production has no public-schema default privilege for
-- functions, so a recreated function gets no service_role grant there (ACL
-- {postgres=X/postgres,authenticated=X/postgres}); a stack whose defaults add
-- one (the local CLI stack) is brought to that same ACL. No-op on production.
revoke all on function public.list_open_demand_for_workers() from service_role;

-- The worker-insert policy, exactly as 20261021095100 created it.
create policy demand_interest_signals_worker_insert
  on public.demand_interest_signals for insert
  to authenticated
  with check (
    worker_id in (select w.id from public.workers w where w.profile_id = auth.uid())
    and status = 'interested'
    and (
      (demand_interest_signals.request_id is not null
       and exists (select 1 from public.list_open_demand_for_workers() b
                    where b.id = demand_interest_signals.request_id))
      or (demand_interest_signals.request_id is null
          and demand_interest_signals.public_vacancy_id is not null)
    )
  );

commit;
