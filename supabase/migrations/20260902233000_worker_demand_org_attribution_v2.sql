-- @human-gate-approved
-- ─────────────────────────────────────────────────────────────────────────────
-- FINAL COMPLETION (2026-09-02, gate G-10 → REQUIRED_FOR_LAUNCH): the CURRENT-
-- EQUIVALENT port of draft #1046 (2026-08-06), which no longer merges onto
-- main. The defect is STILL LIVE in production, re-measured 2026-09-02:
-- `list_open_demand_for_workers` joins `companies c on c.profile_id =
-- cr.profile_id and c.verification_status = 'verified'`, and one owner holds
-- several verified companies, so every demand of that owner is returned once
-- per company and attributed to companies that do not own it.
-- `customer_requests.organization_id` exists in production (org demand spine
-- v2, ledger 20260806092429), so the RPC can attribute by organisation and fall
-- back to the profile only for legacy rows without one.
--
-- Body = #1046 verbatim (SECURITY DEFINER = RED by rule). Rollback restores the
-- profile-join body verbatim (supabase/rollbacks/…down.sql). No data change.
-- ─────────────────────────────────────────────────────────────────────────────

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
