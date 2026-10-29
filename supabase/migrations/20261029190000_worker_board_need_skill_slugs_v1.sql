-- 20261029190000_worker_board_need_skill_slugs_v1
--
-- RED class (recreates a SECURITY DEFINER worker reader; return type
-- changes). Owner decision 2026-10-29: "APPROVED — PREPARE RED MIGRATION
-- ONLY." Prepared for the owner gate; NOT applied. Production apply is a
-- separate owner approval, via Supabase MCP apply_migration only — never
-- `supabase db push`.
--
-- WHY. The worker board judged a need from its TITLE only: the reader
-- projects no need text (rightly — description and notes are the employer's
-- private words) and no derived requirement set, so a need written as free
-- text ("wet-room finishing specialist" + "tiling and waterproofing of
-- bathrooms") read `not_assessed` to the tiler whose Work Journal shows
-- exactly that work, while company scouting derived tiling + waterproofing
-- from the same row. Two answers about one need.
--
-- WHAT. ONE reader, two additive columns, CATALOGUE SLUGS ONLY — never text:
--   need_skill_slugs  text[]  the need's required skills, each an active
--                             public.skills.slug (anything else is dropped);
--                             null = the need carries no stored set.
--   need_skill_source text    closed set: human_structured | esco_mapped |
--                             recognized_from_text | profession_expanded.
-- Precedence (the same as lib/market/need-skills.ts deriveNeedSkills):
--   1. payload.structured_need.skill_slugs — the company's own confirmed set
--      (confirmRecognizedNeed, an explicit human act)  → human_structured;
--   2. payload.need_skills.slugs — the offline derivation the app stores at
--      intake (lib/market/need-skills-payload.ts, the SAME deriveNeedSkills
--      scouting runs over title + description + skills text + notes) with its
--      own source label (a suggestion, flagged "not confirmed" on the card).
-- No row is written or deleted. Existing needs WITHOUT a stored set keep the
-- exact title-only reading they have today (the app falls back); a backfill
-- of payload.need_skills for them is a DATA change and is NOT part of this
-- migration (separate owner approval).
--
-- Everything else is the CURRENT body byte-for-byte as applied by
-- 20261028123000_synthetic_demand_cross_org_readers_v1 (ledger 20261028161106;
-- production pg_get_functiondef md5 964b1b5405c59fa9578e4a7a2aefe27b == repo):
-- worker-only caller gate, verified-company join (the one demand-company
-- rule), demand-direction allow-list, the synthetic-fixture predicate, the
-- closed column whitelist, LIMIT 100, STABLE SECURITY DEFINER,
-- search_path 'public'.
--
-- WHY DROP + CREATE. Adding columns to RETURNS TABLE changes the return type,
-- which CREATE OR REPLACE refuses. Nothing in SQL depends on the function
-- (no view, no SQL caller — only plpgsql-free PostgREST callers in the app,
-- which read columns by name and ignore extra ones). Precedent:
-- 20260702170000 / 20260705130000 / 20260705200000 dropped and recreated it.
-- The DROP and CREATE run in ONE transaction, so no caller ever sees it absent.
--
-- GRANTS — identical before and after: EXECUTE for authenticated (and the
-- owner) only; revoked from public and anon. (Production ACL before:
-- {postgres=X/postgres,authenticated=X/postgres}.)
--
-- ROLLBACK: supabase/rollbacks/20261029190000_worker_board_need_skill_slugs_v1.down.sql
-- (drop + recreate the 20261028123000 body byte-for-byte, same grants).

begin;

drop function if exists public.list_open_demand_for_workers();

CREATE OR REPLACE FUNCTION public.list_open_demand_for_workers()
 RETURNS TABLE(id uuid, role_text text, country text, team_size integer, start_period text, accommodation text, created_at timestamp with time zone, company_name text, route_status text, location_label text, transport text, required_tools text[], structured jsonb, need_skill_slugs text[], need_skill_source text)
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
           as structured,
         -- THE NEED'S REQUIRED SKILLS (20261029190000): catalogue slugs only,
         -- each an ACTIVE public.skills.slug — never free text.
         ns.slugs as need_skill_slugs,
         ns.source as need_skill_source
    from public.customer_requests cr
    -- THE NEED'S OWN COMPANY — the one rule (20261020010000).
    join public.companies c
      on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
     and c.verification_status = 'verified'
    -- 1. the company's confirmed set; 2. the set derived at intake.
    left join lateral (
      select hs.slugs as human_slugs,
             ds.slugs as derived_slugs,
             case
               when cr.payload -> 'need_skills' ->> 'source' in (
                 'esco_mapped', 'recognized_from_text', 'profession_expanded'
               ) then cr.payload -> 'need_skills' ->> 'source'
               else null
             end as derived_source
        from (select array_agg(distinct v order by v) as slugs
                from jsonb_array_elements_text(
                       case
                         when jsonb_typeof(cr.payload -> 'structured_need' -> 'skill_slugs') = 'array'
                           then cr.payload -> 'structured_need' -> 'skill_slugs'
                         else '[]'::jsonb
                       end) as v
               where exists (select 1 from public.skills s
                              where s.slug = v and s.is_active is not false)) hs,
             (select array_agg(distinct v order by v) as slugs
                from jsonb_array_elements_text(
                       case
                         when jsonb_typeof(cr.payload -> 'need_skills' -> 'slugs') = 'array'
                           then cr.payload -> 'need_skills' -> 'slugs'
                         else '[]'::jsonb
                       end) as v
               where exists (select 1 from public.skills s
                              where s.slug = v and s.is_active is not false)) ds
    ) nsr on true
    cross join lateral (
      select case
               when nsr.human_slugs is not null then nsr.human_slugs
               when nsr.derived_source is not null then nsr.derived_slugs
               else null
             end as slugs,
             case
               when nsr.human_slugs is not null then 'human_structured'
               when nsr.derived_source is not null and nsr.derived_slugs is not null
                 then nsr.derived_source
               else null
             end as source
    ) ns
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

commit;
