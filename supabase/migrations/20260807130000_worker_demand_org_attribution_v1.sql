-- 20260807130000 — worker board organization attribution: one row per demand,
-- attributed to the company that actually owns it
--
-- SAFETY CLASS: RED. This migration recreates a SECURITY DEFINER function
-- (`list_open_demand_for_workers`) and re-issues its GRANT/REVOKE pair. It is
-- deliberately NOT human-gate-annotated: the owner reviews the package
-- (docs/human-gates/worker-demand-org-attribution-gate.md) and decides.
-- Ships UNAPPLIED — merging the PR does NOT apply it. ZERO DML, no backfill,
-- no policy change, no table change, no signature change.
--
-- ── THE BUG (observed live in production, 2026-08-06) ─────────────────────
-- The worker board RPC (last recreated by 20260711330000) resolves the
-- company for a demand row through the OWNER PROFILE:
--
--     join public.companies c
--       on c.profile_id = cr.profile_id
--      and c.verification_status = 'verified'
--
-- Pre-multi-org that join was 1:1. After the multi-org ownership-cap removal
-- (20260805170000) a profile may own SEVERAL verified companies, so the join
-- fans out: every demand row is returned ONCE PER VERIFIED COMPANY of its
-- owner, and each duplicate is attributed to a company that does not own the
-- demand. Observed live 2026-08-06: the [QA-SYNTHETIC] demand of
-- org 9e4f4467… / company c2a43118… also rendered attributed to
-- "QA-SYNTHETIC Beta".
--
-- ── THE FIX ───────────────────────────────────────────────────────────────
-- Post-M-P0-6 (20260806200000_org_demand_spine_v2) the demand row carries
-- `organization_id`. The company is now resolved through THE DEMAND'S OWN
-- ORGANIZATION (`organizations.legacy_company_id`), with a deterministic
-- fallback for pre-org (organization_id IS NULL) rows:
--
--   * stamped rows  → exactly the organization's bound company; if that
--     company is not verified (or the org has no bound company) the row is
--     HIDDEN — the verified gate stays fail-closed and is never satisfied by
--     some OTHER company of the same owner;
--   * pre-org rows  → the owner's OLDEST verified company (order by
--     created_at, id — deterministic), matching the only population the
--     old join was correct for; a multi-company owner's unstamped rows show
--     once instead of N times.
--
-- `join lateral … limit 1` guarantees ONE ROW PER DEMAND by construction.
-- Everything else — auth guard, worker check, column projection, payload
-- whitelisting via demand_structured_v2_public, status filter, ordering,
-- limit, grants — is byte-identical to the 20260711330000 definition.
--
-- ROLLBACK: supabase/rollbacks/20260807130000_worker_demand_org_attribution_v1.down.sql
-- restores the prior profile-join definition verbatim (it knowingly
-- reintroduces the duplication defect — documented there).

-- ── 0. Safety assertions ──────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'customer_requests'
       and column_name = 'organization_id'
  ) then
    raise exception 'customer_requests.organization_id missing — apply 20260806200000 (org demand spine v2) BEFORE this migration';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'organizations'
       and column_name = 'legacy_company_id'
  ) then
    raise exception 'organizations.legacy_company_id missing — 0013 expected';
  end if;
end $$;

-- ── 1. Recreate the worker board RPC — prior definition, new company join ─
-- No DROP: the signature (name, args, return table) is byte-identical to the
-- 20260711330000 definition, so CREATE OR REPLACE swaps the body in place.

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
    -- ONE company per demand, resolved through the demand's own organization.
    -- `limit 1` makes one-row-per-demand structural: a multi-company owner
    -- can never fan a demand out again.
    join lateral (
      select co.display_name, co.legal_name
        from public.companies co
       where co.verification_status = 'verified'
         and (
           -- stamped (post-M-P0-6): ONLY the organization's bound company —
           -- never satisfied by another company of the same owner.
           (cr.organization_id is not null
             and co.id = (select o.legacy_company_id
                            from public.organizations o
                           where o.id = cr.organization_id))
           or
           -- pre-org fallback: the owner's oldest verified company,
           -- deterministic via the order below.
           (cr.organization_id is null
             and co.profile_id = cr.profile_id)
         )
       order by co.created_at asc, co.id asc
       limit 1
    ) c on true
   where cr.status = 'submitted'
   order by cr.created_at desc
   limit 100;
end $$;

revoke all on function
  public.list_open_demand_for_workers() from public;
revoke all on function
  public.list_open_demand_for_workers() from anon;
grant execute on function
  public.list_open_demand_for_workers() to authenticated;
