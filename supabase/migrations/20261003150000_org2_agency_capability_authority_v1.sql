-- @human-gate-approved
-- ============================================================================
-- DRAFT -- needs-human-gate -- DO NOT APPLY automatically.
-- RED class: SECURITY DEFINER authority gates + one RLS policy. Draft PR + owner
-- approval; prod apply stays MANUAL via Supabase MCP `apply_migration`.
-- Never `db push`.
-- ============================================================================
--
-- ORG-2 (owner decision, binding): agency is an ORGANIZATION CAPABILITY, not a
-- permanently isolated account type. Authority converges on
--   PERSON -> ORGANIZATION MEMBERSHIP -> ORGANIZATION ROLE/CAPABILITY -> ACTION.
-- Three legacy gates still authorized on the profile-owned `agencies` row /
-- the profile's active role instead of that chain:
--   R1 public.list_open_demand_for_agencies()   (agencies row by auth.uid())
--   R2 public.mark_agency_can_offer(uuid, text) (agencies row by auth.uid())
--   R3 policy job_demands_select, agencies_only branch (profile_role()='agency')
-- Production consequence: an organization that is an agency by declared role
-- (workforce_provider / talent_provider / recruitment_partner) but whose
-- company_type is not staffing_agency, and every agency owner/admin without a
-- legacy `agencies` row, saw an empty board and 'not_agency'.
--
-- FIX: one canonical caller gate, `public.caller_agency_company_id()`:
--   the caller's company for which owns_company(c) (creator or active
--   owner/admin member -- the one membership rule) AND company_acts_as_agency(c)
--   (company type OR declared workforce role, 20260928180000).
-- No `agencies` gate remains in R1/R2/R3. Nothing is granted to anyone who is
-- not an owner/admin of an agency-capable organization.
--
-- R2 identity key (owner decision delegated 2026-10-03): payload.agency_offers[]
-- now carries the COMPANY id as `agency_id` (canonical), plus `agency_name`,
-- and `legacy_agency_id` when a legacy agencies row exists (backward display).
-- R1's `can_offer_marked` matches either the company id or that legacy id so
-- no existing mark is lost. Production holds 0 customer_requests with
-- agency_offers at write time (re-verified), so nothing needs migrating.
--
-- UNCHANGED: signatures, return shapes, volatility (R1 STABLE, R2 VOLATILE),
-- SECURITY DEFINER, search_path=public, ACL (authenticated only), the
-- customer_requests visibility filter (status 'submitted' + closed kind
-- allow-list), the audit_logs row, every return code.
--
-- NULL-SAFETY: auth.uid() null -> 42501 before any read; the helper returns
-- NULL (never true) for anon / no company; every comparison is is-not-null /
-- coalesce guarded so a NULL can only DENY.
--
-- ROLLBACK: supabase/rollbacks/20261003150000_org2_agency_capability_authority_v1.down.sql
--   (restores today's production bodies and the profile_role() policy verbatim).
-- ============================================================================

-- canonical caller gate ------------------------------------------------------
create or replace function public.caller_agency_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
    from public.companies c
   where auth.uid() is not null
     and (
       c.profile_id = auth.uid()
       or exists (
         select 1
           from public.organizations o
           join public.company_memberships m on m.organization_id = o.id
          where o.legacy_company_id = c.id
            and m.profile_id = auth.uid()
            and m.status = 'active'
       )
     )
     and public.owns_company(c.id)
     and public.company_acts_as_agency(c.id)
   order by c.created_at, c.id
   limit 1
$$;

revoke all on function public.caller_agency_company_id() from public, anon;
grant execute on function public.caller_agency_company_id() to authenticated;

-- R1 -------------------------------------------------------------------------
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
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  v_company := public.caller_agency_company_id();
  if v_company is null then
    return;
  end if;
  select a.id into v_legacy from public.agencies a where a.profile_id = uid;

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
   order by cr.created_at desc
   limit 100;
end
$$;

-- R2 -------------------------------------------------------------------------
create or replace function public.mark_agency_can_offer(p_request_id uuid, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_company uuid;
  v_legacy  uuid;
  v_name    text;
  v_status  text;
  v_marked  boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  v_company := public.caller_agency_company_id();
  if v_company is null then
    return 'not_agency';
  end if;
  select coalesce(nullif(btrim(c.display_name), ''), c.legal_name) into v_name
    from public.companies c where c.id = v_company;
  select a.id into v_legacy from public.agencies a where a.profile_id = uid;

  select cr.status,
         exists (
           select 1
           from jsonb_array_elements(
                  coalesce(cr.payload -> 'agency_offers', '[]'::jsonb)
                ) o
           where o ->> 'agency_id' = v_company::text
              or (v_legacy is not null and o ->> 'agency_id' = v_legacy::text)
         )
    into v_status, v_marked
    from public.customer_requests cr
   where cr.id = p_request_id;
  if not found then
    return 'request_not_found';
  end if;
  if v_status is distinct from 'submitted' then
    return 'request_not_open';
  end if;
  if coalesce(v_marked, false) then
    return 'already_marked';
  end if;

  update public.customer_requests
     set payload = jsonb_set(
           coalesce(payload, '{}'::jsonb),
           '{agency_offers}',
           coalesce(payload -> 'agency_offers', '[]'::jsonb)
             || jsonb_strip_nulls(jsonb_build_object(
                  'agency_id', v_company::text,
                  'agency_name', v_name,
                  'legacy_agency_id', v_legacy::text,
                  'marked_at', now(),
                  'note', nullif(btrim(coalesce(p_note, '')), ''))))
   where id = p_request_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'agency_can_offer', 'customer_requests', p_request_id,
          jsonb_build_object('agency_id', v_company,
                             'note', nullif(btrim(coalesce(p_note, '')), '')));

  return 'marked';
end $$;

-- R3 -------------------------------------------------------------------------
drop policy if exists job_demands_select on public.job_demands;
create policy job_demands_select on public.job_demands
  for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.projects p
       where p.id = job_demands.project_id
         and public.owns_company(p.company_id)
    )
    or (
      status = 'open'
      and auth.uid() is not null
      and (
        visibility = 'public'
        or (visibility = 'agencies_only' and public.caller_agency_company_id() is not null)
      )
    )
  );
