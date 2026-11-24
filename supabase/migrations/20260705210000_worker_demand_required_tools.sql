-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260705210000 — worker demand required tools (product-tree branch 16,
-- train §8.6 equipment/tools layer minimum).
--
-- PROBLEM (reality-map 2026-07-05 §branch 16, RED): tools exist ONLY as a
-- free-text tools[] in the non-persisted marketing preview engine
-- (lib/staffing) — they are NOT on the real demand → RPC → worker-board path.
-- A verified company cannot state required equipment on a real demand and a
-- worker never sees it.
--
-- SOLUTION: extend the ACCOMMODATION/TRANSPORT enum path to a closed SLUG
-- LIST reusing the EXISTING canonical skill taxonomy — NO new taxonomy. The
-- demand wizard stores a whitelisted payload.required_tools slug array
-- (closed set, validated app-side in lib/demand/demand-request.ts — no free
-- text can enter the key); this migration recreates
-- list_open_demand_for_workers() ADDING ONE curated column that projects
-- payload->'required_tools' through a STRICT slug whitelist:
--
--   required_tools text[] — elements limited to the 10 tool/equipment skill
--   slugs that ALREADY exist in the canonical taxonomy
--   (lib/taxonomy/profession-skills.ts / messages/*/skill-names.json):
--   'bulldozer-operator' | 'compactor-operator' | 'crane-operator' |
--   'equipment-operation' | 'excavator-operator' | 'forklift-operator' |
--   'grader-operator' | 'hand-tools' | 'loader-operator' | 'scaffolding'.
--   Anything else (including any free text that might ever land in the
--   payload key) is FILTERED OUT element-by-element; an empty result projects
--   as NULL — the board then shows an honest "not stated".
--
-- WHAT IS DELIBERATELY NOT EXPOSED (unchanged exclusions):
--   - free-text title / need_summary / notes / payload.role / payload.location
--     — NEVER;
--   - contacts / profile ids — NEVER;
--   - address_text / locality (finer than city) — NEVER.
--
-- Everything else is byte-identical to the transport definition
-- (20260705200000, itself the applied Model-A body 20260702170000 + the
-- location_label column 20260705130000 + ONE transport enum column):
-- worker-only caller gate, verified-company approval join (Model A),
-- accommodation + transport whitelists, pinned search_path, definer read,
-- execute revoked from public and granted to authenticated. customer_requests
-- RLS stays untouched. NO new table, NO new column on any table (the slug
-- list rides the existing payload jsonb), NO new taxonomy, NO parallel demand
-- system, NO equipment-rental marketplace.
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER recreate +
-- GRANT are RED-class). Ships as a needs-human-gate DRAFT with the exact
-- SQL; prod apply stays manual via Supabase MCP after owner approval — never
-- db push. Until applied, the app degrades honestly: the loader tolerates
-- the missing field and the board simply shows tools as not stated.
--
-- ROLLBACK: supabase/rollbacks/20260705210000_worker_demand_required_tools.down.sql
-- restores the prior repo-latest definition (20260705200000) VERBATIM.
-- ============================================================================

begin;

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
  required_tools text[]
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
         -- Structured columns ONLY — never the free-text title / need_summary /
         -- notes, never payload.role.
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
         -- Model A: identity of the VERIFIED company only.
         coalesce(
           nullif(trim(c.display_name), ''),
           nullif(trim(c.legal_name), '')
         ) as company_name,
         'approved_direct_partner'::text as route_status,
         -- COARSE place label (city/region) — structured market-map location
         -- first, demand's own location text as fallback. NEVER address_text,
         -- NEVER locality.
         coalesce(
           (select nullif(trim(coalesce(cdl.city, cdl.location_label)), '')
              from public.company_demand_locations cdl
             where cdl.request_id = cr.id
               and cdl.active
             order by cdl.updated_at desc
             limit 1),
           nullif(trim(cr.location), '')
         ) as location_label,
         -- Transport condition — STRICT enum whitelist mirroring the
         -- accommodation projection. Anything outside the closed set (incl.
         -- any free text) projects as NULL, never reaches a worker.
         case
           when cr.payload ->> 'transport' in (
             'provided', 'compensated', 'not_provided', 'unknown'
           ) then cr.payload ->> 'transport'
           else null
         end as transport,
         -- Required tools — STRICT slug whitelist over the EXISTING canonical
         -- taxonomy (§8.6). Element-by-element filter: anything outside the
         -- closed set (incl. any free text) is dropped; empty → NULL. Never
         -- reaches a worker unfiltered.
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
         end as required_tools
    from public.customer_requests cr
    join public.companies c
      on c.profile_id = cr.profile_id
     and c.verification_status = 'verified'   -- the approval gate (model A)
   where cr.status = 'submitted'
   order by cr.created_at desc
   limit 100;
end $$;

revoke all on function
  public.list_open_demand_for_workers() from public;
grant execute on function
  public.list_open_demand_for_workers() to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260705210000_worker_demand_required_tools.down.sql
-- restores the exact prior repo-latest definition (20260705200000).
